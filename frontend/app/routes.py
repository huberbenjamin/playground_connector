from flask import Blueprint, jsonify, request, render_template, url_for

main_bp = Blueprint("main", __name__)

DEMO_OBJECTS = [{
        "id": "extracted_001",
        "name": "Object_A",
        "createdAt": "2026-06-08",
        "fileUrl": "/static/assets/demo/extracted_001.ply",
    },{
        "id": "extracted_002",
        "name": "Object_B",
        "createdAt": "2026-06-10",
        "fileUrl": "/static/assets/demo/extracted_002.ply",
    },{
        "id": "extracted_003",
        "name": "Object_C",
        "createdAt": "2026-06-11",
        "fileUrl": "/static/assets/demo/extracted_003.ply",
    },{
        "id": "extracted_004",
        "name": "Object_D",
        "createdAt": "2026-06-12",
        "fileUrl": "/static/assets/demo/extracted_004.ply",
    },]


@main_bp.get("/")
def index():
    return render_template("index.html")

@main_bp.get("/ar")
def ar_index():
    return render_template("index.html")

@main_bp.get("/ar/viewer")
def ar_viewer():
    object_id = request.args.get("object", "extracted_001") #demo obj
    selected = next((obj for obj in DEMO_OBJECTS if obj["id"] == object_id), DEMO_OBJECTS[0]) #demo obj
    return render_template("viewer.html", selected_object=selected)

@main_bp.get("/api/store-objects")

def store_objects():
    return jsonify(DEMO_OBJECTS)

@main_bp.get("/api/gallery-objects")
def gallery_objects():
    return jsonify(DEMO_OBJECTS[:2]) #just to see two obj in the gallery


# @main_bp.post("/api/example")
# def example_post():
#     data = request.get_json(silent=True) or {}

#     return jsonify({
#         "received": data
#     }), 201
