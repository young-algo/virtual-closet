import os
import glob
import shutil
import json

# Define paths
artifact_dir = "/Users/kevinturner/.gemini/antigravity/brain/ecc658e1-1cfe-4330-b05d-628f701b84c3"
dest_dir = "public/closet"
data_dir = "src/data"

os.makedirs(dest_dir, exist_ok=True)
os.makedirs(data_dir, exist_ok=True)

# List of items and metadata
items = [
    {
        "id": "img_0236",
        "name": "Beige Nike Pocket T-Shirt",
        "category": "T-Shirts",
        "color": "Beige",
        "brand": "Nike",
        "image": "/closet/img_0236.jpg",
        "description": "Short sleeve beige t-shirt with a front chest pocket and small Nike branding."
    },
    {
        "id": "img_0237",
        "name": "Lavender Nike Polo Shirt",
        "category": "Polos",
        "color": "Lavender",
        "brand": "Nike",
        "image": "/closet/img_0237.jpg",
        "description": "Lavender short-sleeve polo shirt with standard collar and orange detail under buttons."
    },
    {
        "id": "img_0238",
        "name": "Yellow Nike Total 90 L/S",
        "category": "Long Sleeves",
        "color": "Yellow",
        "brand": "Nike",
        "image": "/closet/img_0238.jpg",
        "description": "Yellow long-sleeve athletic shirt with horizontal black stripes and Total 90 center chest logo."
    },
    {
        "id": "img_0239",
        "name": "Beige Uniqlo U Crewneck",
        "category": "T-Shirts",
        "color": "Beige",
        "brand": "Uniqlo",
        "image": "/closet/img_0239.jpg",
        "description": "High-quality heavy cotton crewneck t-shirt in beige from Uniqlo U collection."
    },
    {
        "id": "img_0240",
        "name": "White Nike Running T-Shirt",
        "category": "T-Shirts",
        "color": "White",
        "brand": "Nike",
        "image": "/closet/img_0240.jpg",
        "description": "White athletic short sleeve shirt with reflective details and Nike swoosh."
    },
    {
        "id": "img_0241",
        "name": "Mauve Nike Dri-Fit T-Shirt",
        "category": "T-Shirts",
        "color": "Mauve",
        "brand": "Nike",
        "image": "/closet/img_0241.jpg",
        "description": "Dusty rose/mauve short sleeve Dri-Fit training shirt."
    },
    {
        "id": "img_0242",
        "name": "Dusty Pink Chinos",
        "category": "Pants",
        "color": "Pink",
        "brand": "Uniqlo",
        "image": "/closet/img_0242.jpg",
        "description": "Light dusty pink casual cotton chinos."
    },
    {
        "id": "img_0243",
        "name": "Black Casual Chinos",
        "category": "Pants",
        "color": "Black",
        "brand": "Uniqlo",
        "image": "/closet/img_0243.jpg",
        "description": "Classic black casual cotton chinos, durable and versatile."
    },
    {
        "id": "img_0244",
        "name": "Off-White Tailored Trousers",
        "category": "Pants",
        "color": "Off-White",
        "brand": "Uniqlo",
        "image": "/closet/img_0244.jpg",
        "description": "Tailored off-white trousers with clean center creases."
    },
    {
        "id": "img_0246",
        "name": "Navy Utility Chinos",
        "category": "Pants",
        "color": "Navy",
        "brand": "Nike",
        "image": "/closet/img_0246.jpg",
        "description": "Navy blue active utility pants with neon pink ankle highlights."
    }
]

# Copy and rename files
for item in items:
    img_id = item["id"]
    pattern = os.path.join(artifact_dir, f"{img_id}_processed_*.jpg")
    matches = glob.glob(pattern)
    if matches:
        # Get the latest match (just in case there are multiple)
        latest_match = max(matches, key=os.path.getmtime)
        dest_path = os.path.join(dest_dir, f"{img_id}.jpg")
        shutil.copy2(latest_match, dest_path)
        print(f"Copied {os.path.basename(latest_match)} -> {dest_path}")
    else:
        print(f"Warning: No processed image found for {img_id}")

# Write JSON manifest
manifest_path = os.path.join(data_dir, "closet.json")
with open(manifest_path, "w") as f:
    json.dump(items, f, indent=2)
print(f"Wrote manifest -> {manifest_path}")
