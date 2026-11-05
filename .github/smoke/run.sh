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
