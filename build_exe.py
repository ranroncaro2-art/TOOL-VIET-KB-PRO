import os
import sys
import shutil
import subprocess

def log(msg):
    print(f"\n>>> [BUILD] {msg}")

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    standalone_dir = os.path.join(frontend_dir, ".next", "standalone")
    
    # 1. Verify next.config.ts has standalone option enabled and build output exists
    if not os.path.exists(standalone_dir):
        log("Error: standalone folder not found. Please build the frontend first.")
        sys.exit(1)
        
    # 2. Copy Next.js public and static files as required by Next.js standalone
    log("Copying Next.js public and static assets to standalone directory...")
    
    dest_public = os.path.join(standalone_dir, "public")
    dest_static = os.path.join(standalone_dir, ".next", "static")
    
    # Remove existing dest dirs if they exist
    if os.path.exists(dest_public):
        shutil.rmtree(dest_public)
    if os.path.exists(dest_static):
        shutil.rmtree(dest_static)
        
    # Copy directories
    shutil.copytree(os.path.join(frontend_dir, "public"), dest_public)
    shutil.copytree(os.path.join(frontend_dir, ".next", "static"), dest_static)
    log("Successfully copied assets.")

    # 3. Locate system node.exe and copy to root
    log("Locating node.exe...")
    node_exe = None
    try:
        # Search using PowerShell
        output = subprocess.check_output("where.exe node", shell=True, text=True)
        paths = [p.strip() for p in output.strip().split("\n") if p.strip()]
        if paths:
            node_exe = paths[0]
            log(f"Found node.exe at: {node_exe}")
    except Exception as e:
        log(f"Failed to locate node.exe via where: {e}")
        
    if not node_exe or not os.path.exists(node_exe):
        # Try common paths
        common_paths = [
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe"
        ]
        for p in common_paths:
            if os.path.exists(p):
                node_exe = p
                log(f"Found node.exe at common path: {node_exe}")
                break
                
    if not node_exe:
        log("Warning: node.exe not found on the system. The built EXE will rely on the user having Node.js in their PATH.")
    else:
        # Copy to root folder next to launcher.py
        dest_node = os.path.join(root_dir, "node.exe")
        log(f"Copying node.exe to project root: {dest_node}...")
        shutil.copy2(node_exe, dest_node)
        log("Successfully copied node.exe.")

    # 4. Trigger PyInstaller build
    pyinstaller_bin = os.path.join(root_dir, "backend", ".venv", "Scripts", "pyinstaller.exe")
    if not os.path.exists(pyinstaller_bin):
        pyinstaller_bin = "pyinstaller" # fallback to PATH

    log("Running PyInstaller to compile launcher.py into a single EXE...")
    
    # We build as a windowed application (no console window showing backend prints, everything is redirected to Tkinter log!)
    # To do this, we use the --windowed / --noconsole option of PyInstaller.
    # Note: On Windows, --windowed is same as --noconsole.
    
    cmd = [
        pyinstaller_bin,
        "--onefile",
        "--windowed", # hides backend console, everything goes to Tkinter ScrolledText!
        "--name=NovelWriterV3",
        f"--add-data=backend;backend",
        f"--add-data=frontend/.next/standalone;frontend/.next/standalone",
    ]
    
    # Include node.exe if it was copied
    if os.path.exists(os.path.join(root_dir, "node.exe")):
        cmd.append(f"--add-data=node.exe;.")
        
    cmd.append("launcher.py")
    
    log(f"Executing command: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    
    log("Build process complete! Check the 'dist' folder for your executable 'NovelWriterV3.exe'.")

if __name__ == "__main__":
    main()
