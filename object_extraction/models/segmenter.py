import torch
from torchvision import transforms
from PIL import Image
from transformers import AutoModelForImageSegmentation

class BackgroundSegmenter:
    def __init__(self, device: str = "cuda"):
        self.device = torch.device(device if torch.cuda.is_available() else "cpu")
        print(f"Initializing BiRefNet on device: {self.device}...")
        
        # FIX: Force Hugging Face to map the device directly inside the native constructor
        # This prevents the secondary .to(device) thread deadlock after instantiation
        self.model = AutoModelForImageSegmentation.from_pretrained(
            "ZhengPeng7/BiRefNet", 
            trust_remote_code=True,
            device_map=self.device
        )
        self.model.eval()
        print("Model weights loaded successfully.")

        self.image_size = (1024, 1024)
        self.transform = transforms.Compose([
            transforms.Resize(self.image_size),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

    @torch.inference_mode()
    def remove_background(self, input_image: Image.Image) -> tuple[Image.Image, Image.Image]:
        """
        Takes a PIL Image, runs BiRefNet inference.
        Returns:
            - A 4-channel transparent RGBA image with background blacked out.
            - A 1-channel grayscale PIL Image mask (foreground white, background black).
        """
        original_size = input_image.size
        
        # Enforce strict black background flattening for incoming PNG transparency
        if input_image.mode in ("RGBA", "LA") or (input_image.mode == "P" and "transparency" in input_image.info):
            black_bg = Image.new("RGBA", input_image.size, (0, 0, 0, 255))
            input_image_flattened = Image.alpha_composite(black_bg, input_image.convert("RGBA"))
            rgb_image = input_image_flattened.convert("RGB")
        else:
            rgb_image = input_image.convert("RGB")
        
        # Prepare tensor input
        input_tensor = self.transform(rgb_image).unsqueeze(0).to(self.device)
        
        # Dynamically match input precision to the target weights format
        weight_dtype = next(self.model.parameters()).dtype
        input_tensor = input_tensor.to(dtype=weight_dtype)
        
        print("Running inference model pass...")
        outputs = self.model(input_tensor)
        
        # BiRefNet outputs a multi-scale list of predictions; the last index is the target map
        preds = outputs[-1].sigmoid().cpu().to(torch.float32).squeeze(0)
        
        # Convert raw tracking array back into a PIL Grayscale Mask
        mask_pil = transforms.ToPILImage()(preds)
        mask = mask_pil.resize(original_size, Image.Resampling.BILINEAR)

        # 1. Create a solid black RGB background of the same size
        black_background = Image.new("RGB", original_size, (0, 0, 0))
        
        # 2. Composite the original RGB image onto the black background using the mask.
        clean_rgb = Image.composite(rgb_image, black_background, mask)
        
        # 3. Add the transparency back on top
        output_image = clean_rgb.convert("RGBA")
        output_image.putalpha(mask)
        
        return output_image, mask
    

if __name__ == "__main__":
    import os
    import re

    base_dir = os.path.dirname(__file__)
    input_dir = os.path.normpath(os.path.join(base_dir, "..", "test_images"))
    output_dir = os.path.normpath(os.path.join(base_dir, "..", "extracted_2d_images"))
    
    # --- NEW: Separate dedicated mask folder ---
    mask_output_dir = os.path.normpath(os.path.join(base_dir, "..", "segmentation_masks"))
    
    image_extensions = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}

    if not os.path.isdir(input_dir):
        raise SystemExit(f"Error: Could not find test images directory at '{input_dir}'")

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(mask_output_dir, exist_ok=True)

    image_files = sorted(
        f for f in os.listdir(input_dir)
        if os.path.splitext(f)[1].lower() in image_extensions
    )

    if not image_files:
        raise SystemExit(f"Error: No supported image files found in '{input_dir}'")

    segmenter = BackgroundSegmenter(device="cuda")

    for filename in image_files:
        stem, ext = os.path.splitext(filename)
        match = re.search(r"(\d+)$", stem)
        index = match.group(1) if match else stem
        
        # Naming definitions
        output_name = f"extracted_{index}{ext}"
        mask_name = f"extracted_{index}.png" 

        input_path = os.path.join(input_dir, filename)
        output_path = os.path.join(output_dir, output_name)
        mask_path = os.path.join(mask_output_dir, mask_name)

        print(f"Processing '{input_path}'...")
        raw_img = Image.open(input_path)
        
        clean_object, mask_file = segmenter.remove_background(raw_img)
        
        # Save assets to their respective folders
        clean_object.save(output_path, "PNG")
        mask_file.save(mask_path, "PNG")
        print(f" -> Saved Asset: {output_path}")
        print(f" -> Saved Mask:  {mask_path}")

    print(f"\nFinished processing {len(image_files)} image(s).")