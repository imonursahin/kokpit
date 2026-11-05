#!/bin/sh
set -e
[ "$(uname)" = "Darwin" ] || exit 0
APP=node_modules/electron/dist/Electron.app
[ -d "$APP" ] || exit 0
/usr/libexec/PlistBuddy -c "Set :CFBundleName Kokpit" -c "Set :CFBundleDisplayName Kokpit" "$APP/Contents/Info.plist"
if [ -f build/icon.png ]; then
  ICONFILE=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$APP/Contents/Info.plist")
  case "$ICONFILE" in *.icns) ;; *) ICONFILE="$ICONFILE.icns" ;; esac
  SET=$(mktemp -d)/kokpit.iconset
  mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s build/icon.png --out "$SET/icon_${s}x${s}.png" >/dev/null
    d=$((s * 2))
    sips -z $d $d build/icon.png --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/$ICONFILE"
  rm -rf "$(dirname "$SET")"
  touch "$APP"
fi
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
