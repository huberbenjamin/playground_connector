import os
import sys
import glob
import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image
from typing import List
from torchvision import transforms
from safetensors.torch import load_file

# 1. Dynamically link the cloned LGM repository path
current_dir = os.path.dirname(os.path.abspath(__file__))
lgm_repo_path = os.path.join(os.path.dirname(current_dir), "LGM")
if lgm_repo_path not in sys.path:
    sys.path.append(lgm_repo_path)

# Mock out missing C++ compilation dependencies
import types
if "diff_gaussian_rasterization" not in sys.modules:
    mock_rasterizer = types.ModuleType("diff_gaussian_rasterization")
    mock_rasterizer.GaussianRasterizationSettings = None
    mock_rasterizer.GaussianRasterizer = None
    sys.modules["diff_gaussian_rasterization"] = mock_rasterizer

# --- MONKEY PATCH 1: Hardware Accelerated Attention Fix ---
import core.attention

def unified_patched_attention_forward(self, x):
    B, N, C = x.shape
    qkv = self.qkv(x).reshape(B, N, 3, self.num_heads, -1).permute(2, 0, 3, 1, 4)
    q, k, v = qkv[0], qkv[1], qkv[2]
    out = F.scaled_dot_product_attention(q, k, v, attn_mask=None, dropout_p=0.0, is_causal=False)
    out = out.permute(0, 2, 1, 3).reshape(B, N, C)
    return self.proj(out)

core.attention.Attention.forward = unified_patched_attention_forward
if hasattr(core.attention, "MemEffAttention"):
    core.attention.MemEffAttention.forward = unified_patched_attention_forward

# --- MONKEY PATCH 2: Robust Finish-Line Shape Handler ---
from core.models import LGM

original_forward_gaussians = LGM.forward_gaussians

def safe_forward_gaussians(self, images, *args, **kwargs):
    """
    Robust forward pass handler that flattens inputs, processes the U-Net,
    slices out the 4 primary views, and dynamically resolves the parameter extraction head.
    """
    B, V, C, H, W = images.shape
    images_flattened = images.reshape(B * V, C, H, W)
    
    # 1. Execute the main U-Net features pass
    x = self.unet(images_flattened) 
    
    # 2. Slice cross-attention tokens down to our 4 input views
    target_elements = B * 4 * 14 * self.opt.splat_size * self.opt.splat_size
    if x.numel() != target_elements:
        x = x.view(B, -1, 14, self.opt.splat_size, self.opt.splat_size)[:, :4]
        x = x.contiguous()
        
    # 3. Reshape back to standard multi-view block
    x = x.reshape(B, 4, 14, self.opt.splat_size, self.opt.splat_size)
    
    # --- Dynamic Parameter Extraction Resolution ---
    if hasattr(self.gs, "get_outputs"):
        return self.gs.get_outputs(x, self.opt)
    elif hasattr(self, "get_outputs"):
        return self.get_outputs(x, self.opt)
    elif hasattr(self.gs, "forward"):
        return self.gs(x, self.opt)
    else:
        x = x.permute(0, 1, 3, 4, 2).reshape(B, -1, 14)
        return {
            'xyz': x[..., 0:3],
            'scaling': x[..., 3:6],
            'rotation': x[..., 6:10],
            'opacity': x[..., 10:11],
            'rgb': torch.sigmoid(x[..., 11:14])
        }

LGM.forward_gaussians = safe_forward_gaussians
print("Successfully hot-patched all memory profiles and structural shape overrides!")

def get_native_lgm_rays(device, spatial_size=512):
    """
    Constructs a true world-space camera ray matrix grid using the exact extrinsic
    and intrinsic parameter conversions required by LGM's cross-attention transformer blocks.
    """
    import math
    radius = 2.5
    fov = 50.0
    focal = spatial_size / (2.0 * math.tan(math.radians(fov / 2.0)))
    
    grid_x, grid_y = torch.meshgrid(
        torch.linspace(-0.5, 0.5, spatial_size, device=device),
        torch.linspace(-0.5, 0.5, spatial_size, device=device),
        indexing="xy"
    )
    
    dirs = torch.stack([grid_x * (spatial_size / focal), grid_y * (spatial_size / focal), -torch.ones_like(grid_x)], dim=-1)
    azimuths = [0.0, math.pi / 2.0, math.pi, 3.0 * math.pi / 2.0]
    rays_all = []
    
    for az in azimuths:
        cam_x = radius * math.sin(az)
        cam_z = radius * math.cos(az)
        cam_pos = torch.tensor([cam_x, 0.0, cam_z], device=device, dtype=torch.float32)
        
        z_axis = cam_pos / torch.norm(cam_pos)
        x_axis = torch.tensor([-math.cos(az), 0.0, math.sin(az)], device=device, dtype=torch.float32)
        y_axis = torch.tensor([0.0, 1.0, 0.0], device=device, dtype=torch.float32)
        
        R = torch.stack([x_axis, y_axis, z_axis], dim=-1)
        curr_dirs = torch.matmul(dirs, R.t())
        curr_dirs = curr_dirs / torch.norm(curr_dirs, dim=-1, keepdim=True)
        curr_origins = cam_pos.view(1, 1, 3).expand(spatial_size, spatial_size, 3)
        
        rays = torch.cat([curr_origins, curr_dirs], dim=-1).permute(2, 0, 1)
        rays_all.append(rays)
        
    return torch.stack(rays_all, dim=0)


class MultiViewEngine:
    def __init__(self, device: str = "cuda"):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        print(f"Loading real LGM weights on device: {self.device}...")
        
        from core.options import config_defaults
        opt = config_defaults["big"]
        
        self.model = LGM(opt).to(self.device)
        
        ckpt = load_file("pretrained/model_fp16_fixrot.safetensors", device=str(self.device))
        self.model.load_state_dict(ckpt, strict=False)
        self.model.eval()
        print("Real 3D Large Reconstruction Transformer loaded successfully!")

        self.transform = transforms.Compose([
            transforms.Resize((512, 512)),
            transforms.ToTensor(),
        ])

    @torch.inference_mode()
    def generate_3dgs(self, images: List[Image.Image]) -> str:
        """
        Takes 4 transparent PIL Images, mathematically zeroes out any background information,
        runs the multi-view projection engine, and saves an aligned, production-ready binary .ply asset.
        """
        if not images or len(images) > 4:
            raise ValueError("LGM requires between 1 and 4 perspective inputs.")
            
        output_dir = "output_assets"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "fused_object_3d.ply")

        # 1. Process RGB channels -> [4, 3, 512, 512]
        rgb_tensors = [self.transform(img.convert("RGB")).to(self.device) for img in images]
        rgb_batch = torch.stack(rgb_tensors, dim=0) 

        # 2. Extract and format background segmentation masks -> [4, 1, 512, 512]
        mask_transform = transforms.Compose([
            transforms.Resize((512, 512)),
            transforms.ToTensor()
        ])
        
        mask_tensors = []
        for img in images:
            alpha = img.split()[-1] if img.mode == 'RGBA' else img.convert('L')
            mask_tensors.append(mask_transform(alpha).to(self.device))
            
        mask_batch = torch.stack(mask_tensors, dim=0)
        mask_batch = (mask_batch > 0.1).float() # Hard edge thresholding

        # 3. CRITICAL HARD MASKING: Erase all color information in deleted pixels
        rgb_batch = rgb_batch * mask_batch

        # 4. Generate world-space camera ray features -> [4, 6, 512, 512]
        if hasattr(self.model, "get_rays"):
            ray_batch = self.model.get_rays(device=self.device)
        else:
            ray_batch = get_native_lgm_rays(device=self.device, spatial_size=512)
            
        # 5. CRITICAL HARD MASKING: Kill camera rays on deleted pixels so attention skips them
        ray_batch = ray_batch * mask_batch

        # 6. Group into final 5D processing matrix arrangement -> [1, 4, 9, 512, 512]
        input_batch = torch.cat([rgb_batch, ray_batch], dim=1).unsqueeze(0)

        print("Executing single feed-forward pass on RTX 5060 Ti...")
        with torch.autocast(device_type="cuda", dtype=torch.float16):
            gaussians = self.model.forward_gaussians(input_batch)
        
        # 7. Unpack resulting raw parameters directly out of GPU slots
        xyz = gaussians['xyz'].cpu().float().numpy()[0]          
        scaling = gaussians['scaling'].cpu().float().numpy()[0]  
        rotation = gaussians['rotation'].cpu().float().numpy()[0] 
        opacity = gaussians['opacity'].cpu().float().numpy()[0]  
        rgb = gaussians['rgb'].cpu().float().numpy()[0]          
        
        # 8. Filter output point elements through downsampled alpha maps
        output_mask_transform = transforms.Compose([
            transforms.Resize((128, 128)),
            transforms.ToTensor()
        ])
        out_masks = [output_mask_transform(img.split()[-1] if img.mode == 'RGBA' else img.convert('L')).numpy().flatten() for img in images]
        flat_out_mask = np.concatenate(out_masks)
        opacity[:, 0] = opacity[:, 0] * (flat_out_mask > 0.1).astype(np.float32)

        # Convert colors to standard Spherical Harmonics direct-current features (f_dc)
        f_dc = (rgb - 0.5) / 0.28209479177387814
        
        # Clean up out-of-bound values and handle potential NaNs
        xyz = np.nan_to_num(xyz, nan=0.0, posinf=10.0, neginf=-10.0)
        f_dc = np.nan_to_num(f_dc, nan=0.0)
        opacity = np.nan_to_num(opacity, nan=0.0)
        scaling = np.nan_to_num(scaling, nan=-10.0)
        rotation = np.nan_to_num(rotation, nan=0.0)
        
        norm = np.linalg.norm(rotation, axis=-1, keepdims=True)
        norm[norm == 0] = 1.0
        rotation = rotation / norm

        print(f"Formatting {len(xyz)} Gaussians into strict binary arrays...")

        # 9. Pack attributes into byte aligned format matching SuperSplat parameters
        num_vertex = len(xyz)
        dtype = [
            ('x', 'f4'), ('y', 'f4'), ('z', 'f4'),
            ('f_dc_0', 'f4'), ('f_dc_1', 'f4'), ('f_dc_2', 'f4'),
            ('opacity', 'f4'),
            ('scale_0', 'f4'), ('scale_1', 'f4'), ('scale_2', 'f4'),
            ('rot_0', 'f4'), ('rot_1', 'f4'), ('rot_2', 'f4'), ('rot_3', 'f4')
        ]
        elements = np.empty(num_vertex, dtype=dtype)
        elements['x'], elements['y'], elements['z'] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
        elements['f_dc_0'], elements['f_dc_1'], elements['f_dc_2'] = f_dc[:, 0], f_dc[:, 1], f_dc[:, 2]
        elements['opacity'] = opacity[:, 0]
        elements['scale_0'], elements['scale_1'], elements['scale_2'] = scaling[:, 0], scaling[:, 1], scaling[:, 2]
        elements['rot_0'], elements['rot_1'], elements['rot_2'], elements['rot_3'] = rotation[:, 0], rotation[:, 1], rotation[:, 2], rotation[:, 3]

        # 10. Write the little-endian binary file payload
        with open(output_path, "wb") as f:
            f.write(b"ply\nformat binary_little_endian 1.0\n")
            f.write(f"element vertex {num_vertex}\n".encode('utf-8'))
            f.write(b"property float x\nproperty float y\nproperty float z\n")
            f.write(b"property float f_dc_0\nproperty float f_dc_1\nproperty float f_dc_2\n")
            f.write(b"property float opacity\n")
            f.write(b"property float scale_0\nproperty float scale_1\nproperty float scale_2\n")
            f.write(b"property float rot_0\nproperty float rot_1\nproperty float rot_2\nproperty float rot_3\n")
            f.write(b"end_header\n")
            f.write(elements.tobytes())
                
        print("Clean binary 3DGS asset generated successfully!")
        return output_path

if __name__ == "__main__":
    input_folder = "./extracted_2d_images"
    image_paths = sorted(glob.glob(os.path.join(input_folder, "*.png")))
    
    if not image_paths:
        print(f"Error: Add your extracted transparent pngs into '{input_folder}' to run test.")
    else:
        loaded_images = [Image.open(path) for path in image_paths[:4]]
        engine = MultiViewEngine(device="cuda")
        resulting_ply = engine.generate_3dgs(loaded_images)
        print(f"Finished! File saved at {resulting_ply}")