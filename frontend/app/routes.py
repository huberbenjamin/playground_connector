from flask import Blueprint, jsonify, request, render_template, url_for

main_bp = Blueprint("main", __name__)

DEMO_OBJECTS = [
    {
        "id": "demo_object",
        "name": "Demo Object",
        "createdAt": "2026-06-12",
        "files": [
            "/static/assets/demo/extracted_001.sog",
            "/static/assets/demo/extracted_002.sog",
            "/static/assets/demo/extracted_003.sog",
            "/static/assets/demo/extracted_004.sog",
        ],
    }
]


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
    return jsonify([])


# @main_bp.post("/api/example")
# def example_post():
#     data = request.get_json(silent=True) or {}

#     return jsonify({
#         "received": data
#     }), 201
