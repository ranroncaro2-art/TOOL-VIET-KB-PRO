import os
import sys
import threading
import subprocess
import webbrowser
import time
import socket
import tkinter as tk
from tkinter import messagebox, scrolledtext

# Port configuration
BACKEND_PORT = 8000
FRONTEND_PORT = 3001

# Path setups
if getattr(sys, 'frozen', False):
    # Running inside PyInstaller bundle
    base_dir = sys._MEIPASS
    exe_dir = os.path.dirname(sys.executable)
    # Ensure current working directory is next to the EXE
    os.chdir(exe_dir)
else:
    # Running in development
    base_dir = os.path.dirname(os.path.abspath(__file__))
    exe_dir = base_dir

# Add backend directory to sys.path
backend_dir = os.path.join(base_dir, "backend")
sys.path.insert(0, backend_dir)

# Now we can import the FastAPI app and seed db
try:
    from app.main import app as fastapi_app
    from app.database import Base, engine
    from app.main import startup_event
except Exception as e:
    print(f"Error importing backend modules: {e}")
    fastapi_app = None

# Thread safe print to Tkinter GUI
log_queue = []
log_lock = threading.Lock()

def gui_print(msg):
    timestamp = time.strftime("[%H:%M:%S]")
    full_msg = f"{timestamp} {msg}\n"
    with log_lock:
        log_queue.append(full_msg)

class NovelWriterLauncher:
    def __init__(self, root):
        self.root = root
        self.root.title("Novel Writer V3 - Manager (v1.0.0)")
        self.root.geometry("600x450")
        self.root.minsize(500, 350)
        self.root.configure(bg="#1e1e2e")

        # Title Label
        title_label = tk.Label(
            root, 
            text="NOVEL WRITER V3", 
            font=("Helvetica", 16, "bold"), 
            fg="#cba6f7", 
            bg="#1e1e2e"
        )
        title_label.pack(pady=10)

        # Status Frame
        status_frame = tk.Frame(root, bg="#1e1e2e")
        status_frame.pack(pady=5)

        self.backend_status = tk.Label(
            status_frame, 
            text="Backend: Đang khởi động...", 
            font=("Helvetica", 10), 
            fg="#f9e2af", 
            bg="#1e1e2e"
        )
        self.backend_status.pack(anchor="w")

        self.frontend_status = tk.Label(
            status_frame, 
            text="Frontend: Đang khởi động...", 
            font=("Helvetica", 10), 
            fg="#f9e2af", 
            bg="#1e1e2e"
        )
        self.frontend_status.pack(anchor="w")

        # Buttons Frame
        btn_frame = tk.Frame(root, bg="#1e1e2e")
        btn_frame.pack(pady=10)

        self.btn_open = tk.Button(
            btn_frame, 
            text="Mở ứng dụng (Browser)", 
            command=self.open_browser, 
            font=("Helvetica", 10, "bold"), 
            bg="#a6e3a1", 
            fg="#11111b",
            padx=10, 
            pady=5,
            state=tk.DISABLED
        )
        self.btn_open.grid(row=0, column=0, padx=10)

        self.btn_stop = tk.Button(
            btn_frame, 
            text="Thoát và Dừng", 
            command=self.shutdown, 
            font=("Helvetica", 10, "bold"), 
            bg="#f38ba8", 
            fg="#11111b",
            padx=10, 
            pady=5
        )
        self.btn_stop.grid(row=0, column=1, padx=10)

        # Console Log Window
        log_label = tk.Label(
            root, 
            text="Nhật ký hoạt động (Logs):", 
            font=("Helvetica", 9), 
            fg="#a6adc8", 
            bg="#1e1e2e"
        )
        log_label.pack(anchor="w", padx=20)

        self.log_area = scrolledtext.ScrolledText(
            root, 
            wrap=tk.WORD, 
            width=70, 
            height=12, 
            bg="#11111b", 
            fg="#cdd6f4", 
            insertbackground="white", 
            font=("Consolas", 9)
        )
        self.log_area.pack(padx=20, pady=5, fill=tk.BOTH, expand=True)

        # Start servers
        self.frontend_process = None
        self.running = True
        
        # Start logging poller
        self.root.after(100, self.poll_logs)

        # Start server threads
        threading.Thread(target=self.start_backend, daemon=True).start()
        threading.Thread(target=self.start_frontend, daemon=True).start()
        threading.Thread(target=self.monitor_startup, daemon=True).start()

        # Handle window close
        self.root.protocol("WM_DELETE_WINDOW", self.shutdown)

    def poll_logs(self):
        with log_lock:
            if log_queue:
                for log in log_queue:
                    self.log_area.insert(tk.END, log)
                self.log_area.see(tk.END)
                log_queue.clear()
        if self.running:
            self.root.after(100, self.poll_logs)

    def start_backend(self):
        gui_print("Khởi động FastAPI Backend...")
        if not fastapi_app:
            gui_print("LỖI: Không tìm thấy FastAPI app module.")
            self.backend_status.config(text="Backend: LỖI", fg="#f38ba8")
            return

        try:
            # Run startup seed db
            gui_print("Kiểm tra và khởi tạo Cơ sở dữ liệu (SQLite)...")
            startup_event()
            
            gui_print(f"Chạy Uvicorn trên cổng {BACKEND_PORT}...")
            self.backend_status.config(text="Backend: Đang chạy (Port 8000)", fg="#a6e3a1")
            
            uvicorn.run(
                fastapi_app, 
                host="0.0.0.0", 
                port=BACKEND_PORT, 
                log_level="info", 
                access_log=False
            )
        except Exception as e:
            gui_print(f"LỖI khởi động Backend: {e}")
            self.backend_status.config(text="Backend: LỖI", fg="#f38ba8")

    def start_frontend(self):
        gui_print("Khởi động Next.js Standalone Frontend...")
        
        # Determine path to server.js
        server_js = os.path.join(base_dir, "frontend", ".next", "standalone", "server.js")
        
        # If it doesn't exist, log warning
        if not os.path.exists(server_js):
            # Try fallback to project-relative dev path
            server_js = os.path.join(base_dir, "frontend", "server.js")
            
        if not os.path.exists(server_js):
            gui_print(f"LỖI: Không tìm thấy file {server_js}")
            self.frontend_status.config(text="Frontend: LỖI", fg="#f38ba8")
            return

        # Check for bundled node.exe or look in system path
        node_bin = os.path.join(base_dir, "node.exe")
        if not os.path.exists(node_bin):
            node_bin = "node" # system path fallback

        gui_print(f"Đang chạy Next.js từ: {server_js}")
        gui_print(f"Sử dụng Node: {node_bin}")

        # Setup environment variables for Next.js standalone
        env = os.environ.copy()
        env["PORT"] = str(FRONTEND_PORT)
        env["HOSTNAME"] = "127.0.0.1"
        env["NODE_ENV"] = "production"

        try:
            # Hide console window of spawned node.exe on Windows
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE

            self.frontend_process = subprocess.Popen(
                [node_bin, server_js],
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                startupinfo=startupinfo,
                bufsize=1
            )
            
            self.frontend_status.config(text=f"Frontend: Đang chạy (Port {FRONTEND_PORT})", fg="#a6e3a1")
            
            # Read stdout line by line and print to GUI log
            for line in iter(self.frontend_process.stdout.readline, ''):
                if line:
                    gui_print(f"[Next.js] {line.strip()}")
            
        except Exception as e:
            gui_print(f"LỖI khởi động Frontend: {e}")
            self.frontend_status.config(text="Frontend: LỖI", fg="#f38ba8")

    def monitor_startup(self):
        # Wait up to 10 seconds for ports to open
        gui_print("Đang kiểm tra kết nối cổng hoạt động...")
        for _ in range(30):
            if not self.running:
                return
            time.sleep(0.5)
            
            backend_ok = self.check_port(BACKEND_PORT)
            frontend_ok = self.check_port(FRONTEND_PORT)
            
            if backend_ok and frontend_ok:
                gui_print("Cả hai dịch vụ đã hoạt động ổn định!")
                self.btn_open.config(state=tk.NORMAL)
                # Auto open browser once ready
                self.open_browser()
                return

        gui_print("Cảnh báo: Dịch vụ đang khởi động lâu hơn dự kiến. Bạn vẫn có thể thử mở ứng dụng.")
        self.btn_open.config(state=tk.NORMAL)

    def check_port(self, port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.2)
            try:
                s.connect(("127.0.0.1", port))
                return True
            except:
                return False

    def open_browser(self):
        url = f"http://127.0.0.1:{FRONTEND_PORT}"
        gui_print(f"Mở trình duyệt truy cập: {url}")
        webbrowser.open(url)

    def shutdown(self):
        self.running = False
        gui_print("Đang tắt các dịch vụ...")
        
        # Kill frontend node process
        if self.frontend_process:
            gui_print("Dừng Next.js server...")
            try:
                self.frontend_process.terminate()
                self.frontend_process.wait(timeout=2)
            except Exception as e:
                # Force kill if needed
                try:
                    self.frontend_process.kill()
                except:
                    pass
        
        # Uvicorn will terminate when the main process exits
        self.root.destroy()
        sys.exit(0)

if __name__ == "__main__":
    # If double clicked and run directly, show GUI
    root = tk.Tk()
    app = NovelWriterLauncher(root)
    root.mainloop()
