"""Read the installed code inside an APK; do not trust only node_modules or Gradle caches."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zipfile

TARGET = 'Lexpo/modules/audio/service/MetadataInjectingPlayer$MetadataForwardingListener;'
REQUIRED = {'onTimelineChanged', 'onMediaItemTransition', 'onPlaybackStateChanged', 'onPlayWhenReadyChanged', 'onPlayerError', 'onPlayerErrorChanged', 'onPositionDiscontinuity', 'onEvents', 'onMediaMetadataChanged', 'onIsPlayingChanged'}

def inspect(data):
    if not data.startswith(b'dex\n'):
        raise ValueError('Not a DEX file')
    def uint(offset):
        return struct.unpack_from('<I', data, offset)[0]
    def uleb(offset):
        result = 0
        for shift in range(0, 35, 7):
            byte = data[offset]
            offset += 1
            result |= (byte & 127) << shift
            if not byte & 128:
                return result, offset
        raise ValueError('Invalid DEX integer')
    def string(index):
        offset = uint(uint(60) + index * 4)
        _, offset = uleb(offset)
        return data[offset:data.index(0, offset)].decode('utf-8', errors='replace')
    def descriptor(type_index):
        return string(uint(uint(68) + type_index * 4))
    for index in range(uint(96)):
        entry = uint(100) + index * 32
        if descriptor(uint(entry)) != TARGET:
            continue
        offset = uint(entry + 24)
        counts = []
        for _ in range(4):
            value, offset = uleb(offset)
            counts.append(value)
        for _ in range(counts[0] + counts[1]):
            _, offset = uleb(offset)
            _, offset = uleb(offset)
        names = []
        for count in counts[2:]:
            method_index = 0
            for _ in range(count):
                delta, offset = uleb(offset)
                method_index += delta
                _, offset = uleb(offset)
                _, offset = uleb(offset)
                names.append(string(uint(uint(92) + method_index * 8 + 4)))
        return [name for name in names if name.startswith('on')]
    return None

if __name__ == '__main__':
    apk = Path(sys.argv[1])
    matches = []
    with zipfile.ZipFile(apk) as archive:
        for name in archive.namelist():
            if name.startswith('classes') and name.endswith('.dex'):
                callbacks = inspect(archive.read(name))
                if callbacks is not None:
                    matches.append((name, callbacks))
    if len(matches) != 1:
        raise SystemExit('Expected exactly one Expo Audio listener class in APK')
    dex, methods = matches[0]
    missing = sorted(REQUIRED - set(methods))
    print(json.dumps({'apk': str(apk), 'dex': dex, 'callbacks': len(methods), 'missing': missing, 'sha256': hashlib.file_digest(apk.open('rb'), 'sha256').hexdigest()}, indent=2))
    if missing or len(methods) != 37:
        raise SystemExit('APK still contains an incomplete Media3 listener')
