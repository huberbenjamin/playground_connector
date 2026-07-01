from flask import Blueprint, render_template, jsonify, request, url_for, Response, abort, current_app
import requests


main_bp = Blueprint("main", __name__)

DEMO_OBJECTS = [
    {
        "id": "demo_object",
        "name": "Demo Object",
        "createdAt": "2026-06-12",
        "files": [
            "/static/assets/demo/object01.sog",
            "/static/assets/demo/object02.sog",
            "/static/assets/demo/object03.sog",
            "/static/assets/demo/object04.sog",
            "/static/assets/demo/object05.sog",
            "/static/assets/demo/object06.sog",
        ],
    }
]

@main_bp.app_context_processor
def inject_template_config():
    return {
        "api_base_url": current_app.config["API_BASE_URL"]
    }

@main_bp.get("/")
def index():
    return render_template("index.html")

@main_bp.get("/ar")
def ar_index():
    return render_template("index.html")

@main_bp.get("/ar/demo-playground.html")
def demo_playground():
    return render_template("demo_playground.html")

@main_bp.route("/ar/upload")
def upload():
    return render_template("upload.html")

@main_bp.get("/ar/viewer")
def ar_viewer():
    object_id = request.args.get("object", "extracted_001") #demo obj
    selected = next((obj for obj in DEMO_OBJECTS if obj["id"] == object_id), DEMO_OBJECTS[0]) #demo obj
    return render_template("demo_playground.html", selected_object=selected)

@main_bp.get("/api/store-objects")
def store_objects():
    return jsonify(DEMO_OBJECTS)

@main_bp.get("/api/gallery-objects")
def gallery_objects():
    return jsonify([])

@main_bp.route("/ar/sog/<path:filename>")
def proxy_sog(filename):
    api_base_url = current_app.config["API_BASE_URL"].rstrip("/")
    sog_url = f"{api_base_url}/files/sog/{filename}"

    try:
        upstream = requests.get(
            sog_url,
            headers={
                "ngrok-skip-browser-warning": "true"
            },
            stream=True,
            timeout=60
        )
    except requests.RequestException:
        abort(502)

    if upstream.status_code != 200:
        abort(upstream.status_code)

    return Response(
        upstream.iter_content(chunk_size=8192),
        content_type=upstream.headers.get(
            "Content-Type",
            "application/octet-stream"
        ),
        headers={
            "Cache-Control": "public, max-age=31536000",
            "Content-Disposition": f'inline; filename="{filename}"'
        }
    )

# @main_bp.post("/api/example")
# def example_post():
#     data = request.get_json(silent=True) or {}

#     return jsonify({
#         "received": data
#     }), 201
