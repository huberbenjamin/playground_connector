import grpc
from concurrent import futures
import time
import object_extraction_pb2
import object_extraction_pb2_grpc

class GatewayServicer(object_extraction_pb2_grpc.ObjectExtractorServicer):
    def __init__(self):
        # Establish persistent channels to the background sidecar workers
        self.single_worker_channel = grpc.insecure_channel('localhost:50052')
        self.single_worker_stub = object_extraction_pb2_grpc.SingleImageWorkerStub(self.single_worker_channel)
        
        self.multi_worker_channel = grpc.insecure_channel('localhost:50053')
        self.multi_worker_stub = object_extraction_pb2_grpc.MultiImageWorkerStub(self.multi_worker_channel)

    def ExtractObjects(self, request, context):
        num_images = len(request.image_bytes)
        
        if num_images == 0:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details("No images provided.")
            return object_extraction_pb2.ExtractionResponse()
        
        # Route the exact same request payload to the correct worker port
        try:
            if num_images == 1:
                print("Gateway: Forwarding to Single-Image Worker (Port 50052)")
                return self.single_worker_stub.InferSingle(request)
            else:
                print(f"Gateway: Forwarding {num_images} images to Multi-Image Worker (Port 50053)")
                return self.multi_worker_stub.InferMulti(request)
        except grpc.RpcError as e:
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Worker service communication failure: {e.details()}")
            return object_extraction_pb2.ExtractionResponse()

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    object_extraction_pb2_grpc.add_ObjectExtractorServicer_to_server(GatewayServicer(), server)
    server.add_insecure_port('[::]:50051')
    print("Gateway Server running on port 50051...")
    server.start()
    try:
        while True:
            time.sleep(86400)
    except KeyboardInterrupt:
        server.stop(0)

if __name__ == '__main__':
    serve()