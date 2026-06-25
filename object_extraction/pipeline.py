import os
import cv2
import numpy as np
from typing import List, Union
from models.segmenter import BackgroundSegmenter
from models.single_view_3d import SingleViewEngine
from models.multi_view_3d import MultiViewEngine
from utils.post_processing import optimize_splat

class ObjectExtractionEngine:
    def __init__(self, device: str = "cuda"):
        self.device = device
        # Initialize the shared 2D segmenter
        self.segmenter = BackgroundSegmenter(device=self.device)
        
        # Lazy load 3D engines to conserve VRAM if needed
        self.single_view_engine = None
        self.multi_view_engine = None

    def _init_single_engine(self):
        if self.single_view_engine is None:
            self.single_view_engine = SingleViewEngine(device=self.device)

    def _init_multi_engine(self):
        if self.multi_view_engine is None:
            self.multi_view_engine = MultiViewEngine(device=self.device)

    def process_request(self, images: List[np.ndarray], mode: str) -> str:
        """
        Executes the object extraction pipeline.
        :param images: List of raw OpenCV images (BGR matrices)
        :param mode: Execution path selection -> "single" or "multi"
        :return: String path to the optimized .ply / .splat file
        """
        if not images:
            raise ValueError("Image pool cannot be empty.")

        # Step 1: Run 2D Background Removal across all inputs
        masked_images = [self.segmenter.remove_background(img) for img in images]

        # Step 2: Route based on Mode selection
        if mode == "single":
            self._init_single_engine()
            # ml-sharp expects exactly one targeted view
            target_image = masked_images[0]
            raw_splat_path = self.single_view_engine.generate_3dgs(target_image)
            
        elif mode == "multi":
            self._init_multi_engine()
            if len(masked_images) > 4:
                raise ValueError("Multi-view mode capped at 4 images.")
            raw_splat_path = self.multi_view_engine.generate_3dgs(masked_images)
            
        else:
            raise ValueError(f"Invalid mode specified: {mode}")

        # Step 3: Run optimization/quantization for fast AR delivery
        optimized_splat_path = optimize_splat(raw_splat_path)
        
        return optimized_splat_path