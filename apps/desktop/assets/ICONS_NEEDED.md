# Icons Needed for Production Builds

Before creating production builds, you need to add the following icon files to this directory:

## Required Icons

### macOS
- **icon.icns** - Apple Icon Image format
  - Size: 512x512 or 1024x1024 pixels
  - Create using `iconutil` or apps like Image2Icon

### Windows
- **icon.ico** - Windows Icon format
  - Must be multi-resolution (16x16, 32x32, 48x48, 256x256)
  - Create using tools like GIMP, ImageMagick, or online converters

### Linux
- **icon.png** - PNG format
  - Size: 512x512 pixels
  - Standard PNG with transparency

### DMG Background (macOS)
- **dmg-background.png** - Background image for Mac installer
  - Recommended size: 540x380 pixels
  - Shows behind the app icon and Applications folder shortcut

## How to Create Icons

### From a single 1024x1024 PNG source:

**macOS (iconutil):**
```bash
mkdir icon.iconset
sips -z 16 16 source.png --out icon.iconset/icon_16x16.png
sips -z 32 32 source.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 source.png --out icon.iconset/icon_32x32.png
sips -z 64 64 source.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 source.png --out icon.iconset/icon_128x128.png
sips -z 256 256 source.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 source.png --out icon.iconset/icon_256x256.png
sips -z 512 512 source.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 source.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 source.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

**Windows (ImageMagick):**
```bash
convert source.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

## Online Tools
- https://cloudconvert.com/png-to-icns
- https://convertico.com/
- https://icon.kitchen/
