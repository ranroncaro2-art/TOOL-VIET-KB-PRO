import os
import sys
import shutil
import subprocess

def log(msg):
    print(f"\n>>> [DESKTOP BUILD] {msg}")

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "backend")
    frontend_dir = os.path.join(root_dir, "frontend")
    desktop_dir = os.path.join(root_dir, "desktop")
    
    # 1. Compile backend using PyInstaller
    log("Compiling Python backend into a consoleless executable...")
    pyinstaller_bin = os.path.join(backend_dir, ".venv", "Scripts", "pyinstaller.exe")
    if not os.path.exists(pyinstaller_bin):
        pyinstaller_bin = "pyinstaller"

    backend_dist_dir = os.path.join(root_dir, "backend_dist")
    if os.path.exists(backend_dist_dir):
        shutil.rmtree(backend_dist_dir)

    cmd_backend = [
        pyinstaller_bin,
        "--onefile",
        "--noconsole",
        f"--distpath={backend_dist_dir}",
        "--name=backend",
        os.path.join(backend_dir, "run_backend.py")
    ]
    
    log(f"Executing: {' '.join(cmd_backend)}")
    subprocess.run(cmd_backend, check=True)
    log("Python backend compiled successfully.")

    # 2. Build Next.js in standalone mode
    log("Building Next.js frontend...")
    # Change dir to frontend and run npm run build
    subprocess.run("npm run build", cwd=frontend_dir, shell=True, check=True)

    # 3. Copy Next.js assets to standalone folder
    log("Copying Next.js public and static assets to standalone folder...")
    standalone_dir = os.path.join(frontend_dir, ".next", "standalone")
    dest_public = os.path.join(standalone_dir, "public")
    dest_static = os.path.join(standalone_dir, ".next", "static")
    
    if os.path.exists(dest_public):
        shutil.rmtree(dest_public)
    if os.path.exists(dest_static):
        shutil.rmtree(dest_static)

    shutil.copytree(os.path.join(frontend_dir, "public"), dest_public)
    shutil.copytree(os.path.join(frontend_dir, ".next", "static"), dest_static)
    log("Assets copied.")

    # 4. Copy node.exe to project root (so electron-builder can package it)
    log("Locating and copying node.exe...")
    node_exe = None
    try:
        output = subprocess.check_output("where.exe node", shell=True, text=True)
        paths = [p.strip() for p in output.strip().split("\n") if p.strip()]
        if paths:
            node_exe = paths[0]
    except:
        pass
        
    if not node_exe or not os.path.exists(node_exe):
        common_paths = [
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe"
        ]
        for p in common_paths:
            if os.path.exists(p):
                node_exe = p
                break
                
    if node_exe:
        dest_node = os.path.join(root_dir, "node.exe")
        log(f"Copying node.exe to: {dest_node}")
        shutil.copy(node_exe, dest_node)
    else:
        log("Error: node.exe was not found. Cannot proceed with packaging a zero-dependency app.")
        sys.exit(1)

    # 5. Install npm dependencies in desktop directory
    log("Installing dependencies in desktop directory...")
    subprocess.run("npm install", cwd=desktop_dir, shell=True, check=True)

    # 6. Run electron-builder to generate NSIS Installer EXE
    log("Packaging Electron app via electron-builder...")
    subprocess.run("npx electron-builder", cwd=desktop_dir, shell=True, check=True)

    log("Desktop setup app created! Check 'desktop/dist' folder for the installer EXE.")

if __name__ == "__main__":
    main()
