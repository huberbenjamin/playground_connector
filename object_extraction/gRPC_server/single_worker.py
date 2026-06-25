import grpc
from concurrent import futures
import time
import object_extraction_pb2
import object_extraction_pb2_grpc

# TODO: Import your real model execution functions here
# from my_single_image_model import predict

class SingleWorkerServicer(object_extraction_pb2_grpc.SingleImageWorkerServicer):
    def __init__(self):
        print("Loading Single-Image Model into GPU memory...")
        # Initialize your heavy model once here globally
        # self.model = load_model()

    def InferSingle(self, request, context):
        # request.image_bytes[0] contains your raw binary image string
        raw_image = request.image_bytes[0]
        
        # --- Run your model inference here ---
        # dummy placeholder output structure matching your dictionary structure
        detected_items = [{"label": "cat", "confidence": 0.98, "box": [0.1, 0.2, 0.5, 0.6]}]
        # -------------------------------------

        response = object_extraction_pb2.ExtractionResponse()
        for item in detected_items:
            response.objects.append(object_extraction_pb2.DetectedObject(
                label=item["label"],
                confidence=item["confidence"],
                x_min=item["box"][0],
                y_min=item["box"][1],
                x_max=item["box"][2],
                y_max=item["box"][3]
            ))
        return response

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    object_extraction_pb2_grpc.add_SingleImageWorkerServicer_to_server(SingleWorkerServicer(), server)
    server.add_insecure_port('[::]:50052')
    print("Single-Image Worker listening on port 50052...")
    server.start()
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == '__main__':
    serve()