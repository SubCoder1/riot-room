"""Usage: python tools/strip_animation_glb.py <folder with full GLBs> <output folder>

The animation GLBs only need their bones (node names) and clips: the game takes
`gltf.animations` and ignores the scene, but exported files each carried a full
copy of the character mesh (about 600 kB each). Run this on a fresh export to
drop it again.

Strip the character mesh/skin/material out of an animation-only GLB, keeping the nodes
(bone names) and the animation data byte for byte."""
import json, struct, sys
SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

def strip(src, dst):
    b = open(src, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin_ = b[20 + jl + 8: 20 + jl + 8 + struct.unpack("<I", b[20 + jl:24 + jl])[0]]
    used = []
    for a in j["animations"]:
        for s in a["samplers"]:
            for k in ("input", "output"):
                if s[k] not in used:
                    used.append(s[k])
    remap = {old: new for new, old in enumerate(used)}
    out = bytearray(); views = []; accs = []
    for old in used:
        a = j["accessors"][old]
        v = j["bufferViews"][a["bufferView"]]
        assert "byteStride" not in v and "sparse" not in a
        n = a["count"] * NCOMP[a["type"]] * SIZE[a["componentType"]]
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        while len(out) % 4: out.append(0)
        views.append({"buffer": 0, "byteOffset": len(out), "byteLength": n})
        out += bin_[start:start + n]
        na = dict(a); na["bufferView"] = len(views) - 1; na.pop("byteOffset", None)
        accs.append(na)
    for a in j["animations"]:
        for s in a["samplers"]:
            s["input"] = remap[s["input"]]; s["output"] = remap[s["output"]]
    for n in j["nodes"]:
        n.pop("mesh", None); n.pop("skin", None)
    for k in ("meshes", "skins", "materials"):
        j.pop(k, None)
    j["accessors"] = accs; j["bufferViews"] = views
    j["buffers"] = [{"byteLength": len(out)}]
    while len(out) % 4: out.append(0)
    js = json.dumps(j, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    open(dst, "wb").write(b"glTF" + struct.pack("<II", 2, total) + struct.pack("<I", len(js)) + b"JSON" + js + struct.pack("<I", len(out)) + b"BIN\x00" + bytes(out))
    return len(b), total

if __name__ == "__main__":
    import glob, os
    for f in sorted(glob.glob(sys.argv[1] + "/*.glb")):
        a, bsz = strip(f, os.path.join(sys.argv[2], os.path.basename(f)))
        print(os.path.basename(f), a, "->", bsz)
