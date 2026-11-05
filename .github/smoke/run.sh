set -x
mkdir -p smoke-out
APK=app/build/outputs/apk/debug/app-debug.apk
PKG=com.fontaine.wardrobe
adb install -r "$APK"
# Empty closet first.
adb shell am start -W -n $PKG/.MainActivity | tee smoke-out/start-empty.txt
sleep 4
adb exec-out screencap -p > smoke-out/1-today-empty.png
adb shell am force-stop $PKG
# Seed a small closet, then reopen.
adb push .github/smoke/seed.json /data/local/tmp/seed.json
adb shell "run-as $PKG sh -c 'cat /data/local/tmp/seed.json > files/wardrobe.json'"
adb logcat -c
adb shell am start -W -n $PKG/.MainActivity | tee smoke-out/start-seeded.txt
sleep 5
adb exec-out screencap -p > smoke-out/2-today.png
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
tap() { adb shell input tap $(python3 -c "print(int($W*$1), int($H*$2))"); sleep ${3:-2}; }
tap 0.35 0.7375 2; adb exec-out screencap -p > smoke-out/2b-today-logged.png
tap 0.62 0.7375 2   # Undo
adb shell input tap $((W/2)) $((H-150)); sleep 3
tap 0.183 0.341 3; adb exec-out screencap -p > smoke-out/2c-item-detail.png
adb shell input keyevent KEYCODE_BACK; sleep 2
tap 0.903 0.104 4; adb exec-out screencap -p > smoke-out/2d-camera.png
adb shell input keyevent KEYCODE_BACK; sleep 1
adb shell input keyevent KEYCODE_BACK; sleep 2
adb shell input tap $((W/6)) $((H-150)); sleep 2
# Tap OK (left part of the button row is about 60% down on this layout) is fragile; instead tap tabs.
adb shell input tap $((W/2)) $((H-150)); sleep 3
adb exec-out screencap -p > smoke-out/3-closet.png
adb shell input tap $((W*5/6)) $((H-150)); sleep 2
adb exec-out screencap -p > smoke-out/4-profile.png
adb shell input tap $((W/6)) $((H-150)); sleep 2
adb exec-out screencap -p > smoke-out/5-today-again.png
adb logcat -d > smoke-out/logcat.txt
grep -E "FATAL EXCEPTION|AndroidRuntime" -A 30 smoke-out/logcat.txt > smoke-out/crashes.txt || true
echo "crash lines: $(wc -l < smoke-out/crashes.txt)"
exit 0
