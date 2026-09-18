import os
from PIL import Image

source_img = r"C:\Users\DELL\.gemini\antigravity-ide\brain\aa95dcdd-4ed8-4065-815c-7dcc18f1966c\veilex_logo_1789767873005.jpg"
target_dir = r"d:\Veilex\extension\icons"

if not os.path.exists(target_dir):
    os.makedirs(target_dir)

try:
    with Image.open(source_img) as img:
        img = img.convert("RGBA")
        
        # Chrome extension icon sizes
        sizes = [16, 48, 128]
        
        for size in sizes:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            target_path = os.path.join(target_dir, f"icon{size}.png")
            resized.save(target_path, "PNG")
            print(f"Saved {target_path}")
            
    print("Icons successfully generated!")
except Exception as e:
    print(f"Error: {e}")
