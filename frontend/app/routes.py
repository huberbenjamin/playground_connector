from flask import Blueprint, jsonify, request

main_bp = Blueprint("main", __name__)


@main_bp.get("/")
def index():
    return jsonify({
        "message": "Flask server is running"
    })


@main_bp.get("/health")
def health_check():
    return jsonify({
        "status": "ok"
    })


@main_bp.post("/api/example")
def example_post():
    data = request.get_json(silent=True) or {}

    return jsonify({
        "received": data
    }), 201
