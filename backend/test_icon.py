import os
import sys
import ctypes
import time
import threading
import webview

def set_icon(window):
    # Wait a tiny bit for the window to actually exist
    time.sleep(0.5)
    
    icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "installer", "app.ico")
    if not os.path.exists(icon_path):
        print("Icon not found:", icon_path)
        return
        
    print("Loading icon:", icon_path)
    
    user32 = ctypes.windll.user32
    # Load image from file
    LR_LOADFROMFILE = 0x0010
    IMAGE_ICON = 1
    WM_SETICON = 0x0080
    ICON_SMALL = 0
    ICON_BIG = 1

    hicon = user32.LoadImageW(None, icon_path, IMAGE_ICON, 0, 0, LR_LOADFROMFILE)
    if not hicon:
        print("Failed to load icon image via LoadImageW")
        return
        
    hwnd = user32.FindWindowW(None, "NJ India Trading")
    if not hwnd:
        print("Could not find window by title")
        return
        
    print("Setting icon for hwnd:", hwnd)
    user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon)
    user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon)
    print("Icon set successfully!")

if __name__ == '__main__':
    window = webview.create_window("NJ India Trading", html="<h1>Test</h1>")
    
    def on_loaded():
        print("Window loaded!")
        threading.Thread(target=set_icon, args=(window,), daemon=True).start()
        
    window.events.loaded += on_loaded
    webview.start()
