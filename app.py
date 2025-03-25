import os
import uuid
import subprocess
import threading
import zipfile
import logging
from flask import (
    Flask,
    request,
    send_from_directory,
    jsonify,
    send_file,
    render_template_string
)
from io import BytesIO
import shutil
from werkzeug.utils import secure_filename

# Initialize Flask app with static folder in the same directory
app = Flask(__name__, static_folder='static')

# App configuration
app.config.update(
    UPLOAD_FOLDER=os.path.abspath("Input"),
    PROCESSED_FOLDER=os.path.abspath("Output"),
    ALLOWED_EXTENSIONS={"png", "jpg", "jpeg", "webp"},
    REALESRGAN_EXE=os.getenv('REALESRGAN_EXE', './realesrgan/Real-ESRGAN.exe'),
    ALLOWED_MODELS={'4xHFA2k', 'realesr-animevideov3'},
    ALLOWED_SCALES={2, 4},
    MAX_CONTENT_LENGTH=16 * 1024 * 1024  # 16MB upload limit
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Ensure directories exist
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
os.makedirs(app.config["PROCESSED_FOLDER"], exist_ok=True)

# Thread-safe progress tracking
progress_lock = threading.Lock()
progress_dict = {}
batch_files = {}
processes = {}

def clean_filename(filename):
    """Sanitize filename while preserving Unicode characters"""
    return secure_filename(filename)

def get_gpu_name():
    """Get GPU information safely"""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return [{"name": result.stdout.strip()}] if result.stdout else [{"name": "CPU"}]
    except Exception as e:
        logging.error(f"Error getting GPU name: {e}")
        return [{"name": "CPU"}]

def allowed_file(filename):
    """Check if file has allowed extension"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config["ALLOWED_EXTENSIONS"]

@app.route('/')
def index():
    """Serve the main HTML page directly from static folder"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:filename>')
def static_proxy(filename):
    """Serve other static files"""
    return send_from_directory(app.static_folder, filename)

@app.route("/process", methods=["POST"])
def process_image():
    if "files" not in request.files:
        return jsonify({"error": "No files uploaded"}), 400

    files = request.files.getlist("files")
    if len(files) == 0:
        return jsonify({"error": "No selected files"}), 400

    # Validate processing parameters
    try:
        scale = int(request.form.get("scale", "4"))
        if scale not in app.config["ALLOWED_SCALES"]:
            raise ValueError
    except ValueError:
        return jsonify({"error": "Invalid scale value"}), 400

    model = request.form.get("model", "4xHFA2k")
    if model not in app.config["ALLOWED_MODELS"]:
        return jsonify({"error": "Invalid model selected"}), 400

    batch_id = uuid.uuid4().hex
    processed_files = []

    for file in files:
        if file.filename == "" or not allowed_file(file.filename):
            continue

        try:
            original_filename = clean_filename(file.filename.rsplit(".", 1)[0])
            unique_id = uuid.uuid4().hex
            ext = file.filename.rsplit(".", 1)[1].lower()
            
            input_path = os.path.join(
                app.config["UPLOAD_FOLDER"],
                f"{unique_id}_{original_filename}.{ext}"
            )
            output_filename = f"Enhanced_{original_filename}.png"
            output_path = os.path.join(app.config["PROCESSED_FOLDER"], output_filename)

            file.save(input_path)

            cmd = [
                app.config["REALESRGAN_EXE"],
                "-i", input_path,
                "-o", output_path,
                "-s", str(scale),
                "-n", model,
                "-f", "png",
                "-v",
            ]
            if "tta" in request.form:
                cmd.append("-x")

            with progress_lock:
                progress_dict[unique_id] = {
                    "progress": 0,
                    "status": "processing",
                    "output_url": None,
                    "error": None,
                    "output_path": output_path,
                    "original_name": file.filename,
                    "output_filename": output_filename,
                }

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )
            processes[unique_id] = process
            threading.Thread(
                target=run_processing,
                args=(unique_id, cmd, input_path, output_path)
            ).start()
            processed_files.append(unique_id)

        except Exception as e:
            logging.error(f"Error processing file {file.filename}: {e}")
            with progress_lock:
                progress_dict[unique_id] = {
                    "status": "error",
                    "error": str(e),
                    "progress": 0
                }

    with progress_lock:
        batch_files[batch_id] = processed_files

    return jsonify({"batch_id": batch_id, "task_ids": processed_files})

def run_processing(task_id, cmd, input_path, output_path):
    """Handle the actual image processing in a thread"""
    try:
        process = processes.get(task_id)
        if not process:
            return

        for line in process.stdout:
            if '%' in line:
                try:
                    percent = int(line.split('%')[0].strip().split()[-1])
                    with progress_lock:
                        progress_dict[task_id]["progress"] = min(percent, 100)
                except (ValueError, IndexError):
                    pass

        process.wait()
        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, cmd)

        with progress_lock:
            progress_dict[task_id].update({
                "status": "completed",
                "output_url": f"/processed/{os.path.basename(output_path)}"
            })

    except Exception as e:
        logging.error(f"Processing error for task {task_id}: {e}")
        with progress_lock:
            progress_dict[task_id].update({
                "status": "error",
                "error": str(e)
            })
    finally:
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except OSError as e:
            logging.error(f"Error removing {input_path}: {e}")
        
        if task_id in processes:
            del processes[task_id]

@app.route("/progress/<task_id>")
def get_progress(task_id):
    with progress_lock:
        return jsonify(progress_dict.get(task_id, {"error": "Invalid task ID"}))

@app.route("/batch_progress/<batch_id>")
def get_batch_progress(batch_id):
    with progress_lock:
        file_ids = batch_files.get(batch_id, [])
        if not file_ids:
            return jsonify({"error": "Invalid batch ID"}), 404

        status_counts = {"completed": 0, "error": 0, "processing": 0}
        total_progress = 0

        for task_id in file_ids:
            task = progress_dict.get(task_id, {})
            status = task.get("status", "missing")
            status_counts[status] = status_counts.get(status, 0) + 1
            total_progress += task.get("progress", 0)

        avg_progress = total_progress / len(file_ids) if file_ids else 0
        batch_status = "processing"
        
        if status_counts["completed"] == len(file_ids):
            batch_status = "completed"
        elif status_counts["error"] > 0:
            batch_status = "completed_with_errors" if status_counts["completed"] > 0 else "error"

        return jsonify({
            "progress": avg_progress,
            "status": batch_status,
            "details": status_counts
        })

@app.route("/processed/<filename>")
def processed_file(filename):
    return send_from_directory(
        app.config["PROCESSED_FOLDER"],
        filename,
        as_attachment=True,
        mimetype='image/png'
    )

@app.route("/cancel_processing", methods=["POST"])
def cancel_processing():
    data = request.get_json()
    task_id = data.get("task_id")
    
    with progress_lock:
        process = processes.get(task_id)
        if not process or task_id not in progress_dict:
            return jsonify({"error": "Invalid task ID"}), 404
        
        try:
            process.terminate()
            progress_dict[task_id]["status"] = "cancelled"
            return jsonify({"status": "cancelled"})
        except Exception as e:
            logging.error(f"Error cancelling task {task_id}: {e}")
            return jsonify({"error": str(e)}), 500

@app.route("/clear_history", methods=["POST"])
def clear_history():
    try:
        for folder in [app.config["UPLOAD_FOLDER"], app.config["PROCESSED_FOLDER"]]:
            try:
                shutil.rmtree(folder)
                os.makedirs(folder, exist_ok=True)
            except Exception as e:
                logging.error(f"Error clearing {folder}: {e}")

        with progress_lock:
            progress_dict.clear()
            batch_files.clear()
            processes.clear()

        return jsonify({"status": "success"})
    except Exception as e:
        logging.error(f"Error clearing history: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/download_all/<batch_id>")
def download_all(batch_id):
    with progress_lock:
        file_ids = batch_files.get(batch_id, [])

    memory_file = BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_id in file_ids:
            file_data = progress_dict.get(file_id)
            if file_data and file_data["status"] == "completed":
                try:
                    zf.write(file_data["output_path"], file_data["output_filename"])
                except FileNotFoundError:
                    logging.error(f"Missing output file for {file_id}")

    memory_file.seek(0)
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name='Enhanced_Output.zip'
    )

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3010, debug=False)