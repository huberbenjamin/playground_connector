from flask import Blueprint, jsonify, request, render_template

main_bp = Blueprint("main", __name__)


@main_bp.get("/")
def index():
    return render_template("index.html")

@main_bp.get("/ar")
def ar_index():
    return render_template("index.html")

@main_bp.get("/ar/viewer")
def ar_viewer():
    return render_template("viewer.html")


# @main_bp.post("/api/example")
# def example_post():
#     data = request.get_json(silent=True) or {}

#     return jsonify({
#         "received": data
#     }), 201
