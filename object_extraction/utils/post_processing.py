import os
import re
import cv2
import numpy as np
from plyfile import PlyData, PlyElement

def clean_gaussian_with_2d_mask(
    ply_path: str, 
    mask_path: str, 
    output_path: str, 
    mask_threshold: int = 15,    # Lowered from 128 to be more forgiving on edges
    dilation_pixels: int = 3     # Adds a pixel buffer zone around the object
):
    """
    Loads a 3DGS PLY file and its corresponding 2D segmentation mask.
    Projects the 3D Gaussians back to 2D space to prune points landing on the background,
    with adjustable thresholds to protect foreground edge features.
    """
    print(f"Reading 3DGS file: {os.path.basename(ply_path)}")
    plydata = PlyData.read(ply_path)
    vertex = plydata['vertex']
    
    # Extract 3D coordinates
    xyz = np.stack((vertex['x'], vertex['y'], vertex['z']), axis=-1)
    num_points = xyz.shape[0]

    # Load the 2D mask (Grayscale)
    if not os.path.exists(mask_path):
        print(f" -> Error: Matching mask not found at '{mask_path}'. Skipping mask filtering.")
        return False
        
    mask_img = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    
    # --- STEP 1: Apply Dilation Buffer ---
    # This expands the white mask boundaries slightly outwards to prevent eating into the object
    if dilation_pixels > 0:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (dilation_pixels, dilation_pixels))
        mask_img = cv2.dilate(mask_img, kernel, iterations=1)

    mask_h, mask_w = mask_img.shape
    print(f" -> Applying 2D Mask alignment ({mask_w}x{mask_h}) with threshold={mask_threshold}...")

    # --- CAMERA PROJECTION MATRIX (Pinhole Model) ---
    focal_length = max(mask_w, mask_h) 
    cx, cy = mask_w / 2.0, mask_h / 2.0

    z_coords = xyz[:, 2]
    z_coords_safe = np.where(z_coords == 0, 1e-5, z_coords)

    # Perspective projection equations
    u = (xyz[:, 0] * focal_length / z_coords_safe) + cx
    v = (xyz[:, 1] * focal_length / z_coords_safe) + cy

    u_idx = np.round(u).astype(int)
    v_idx = np.round(v).astype(int)

    # Boundary mask ensuring points fall within the 2D image dimensions
    valid_pixel_mask = (u_idx >= 0) & (u_idx < mask_w) & (v_idx >= 0) & (v_idx < mask_h)

    # Initialize final mask array
    keep_mask = np.zeros(num_points, dtype=bool)

    # Check pixel values for points mapping inside the image plane
    inside_indices = np.where(valid_pixel_mask)[0]
    pixel_values = mask_img[v_idx[inside_indices], u_idx[inside_indices]]
    
    # Keep points that land on pixels above our new lenient cutoff threshold
    keep_mask[inside_indices] = pixel_values > mask_threshold

    num_removed = num_points - np.sum(keep_mask)
    print(f" -> Spliced away {num_removed} background Gaussians ({num_removed/num_points:.1%}) using 2D projection.")

    # Rebuild and save the clean 3DGS file
    cleaned_vertex_data = vertex.data[keep_mask]
    cleaned_vertex_element = PlyElement.describe(cleaned_vertex_data, 'vertex')
    
    PlyData([cleaned_vertex_element], text=False).write(output_path)
    print(f" -> Saved clean model to: {os.path.basename(output_path)}")
    return True

def main():
    base_dir = os.path.dirname(__file__)
    
    # Paths setup
    ply_dir = os.path.normpath(os.path.join(base_dir, "..", "extracted_output"))
    mask_dir = os.path.normpath(os.path.join(base_dir, "..", "extracted_2d_images"))
    output_dir = os.path.normpath(os.path.join(base_dir, "..", "extracted_output_cleaned"))

    if not os.path.isdir(ply_dir):
        print(f"Error: Target PLY folder '{ply_dir}' does not exist.")
        return
    if not os.path.isdir(mask_dir):
        print(f"Error: Mask source folder '{mask_dir}' does not exist.")
        return

    os.makedirs(output_dir, exist_ok=True)
    ply_files = sorted([f for f in os.listdir(ply_dir) if f.lower().endswith(".ply")])

    if not ply_files:
        print("No .ply files found to process.")
        return

    for filename in ply_files:
        stem, _ = os.path.splitext(filename)
        
        # Match filenames. If your PLY is "extracted_1.ply", look for "extracted_1.png"
        mask_filename = f"{stem}.png" 
        
        ply_path = os.path.join(ply_dir, filename)
        mask_path = os.path.join(mask_dir, mask_filename)
        output_path = os.path.join(output_dir, filename)

        try:
            clean_gaussian_with_2d_mask(
                ply_path, 
                mask_path, 
                output_path, 
                mask_threshold=15, 
                dilation_pixels=5
            )
        except Exception as e:
            print(f" -> Failed to process {filename}: {e}")


if __name__ == "__main__":
    main()