"""Make cross-platform test ZIPs and preserve macOS .app framework symlinks.

Python zipfile.write dereferences symlinks by default. Framework symlinks
are essential for a runnable .app, so create Unix symlink entries explicitly.
No additional server packages required.
"""
from __future__ import annotations
import hashlib
import os
import stat
import time
import zipfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
OUT=HERE.parent/"static"/"downloads"
OUT.mkdir(parents=True,exist_ok=True)

TARGETS=[
 (HERE/"dist"/"FILE-O-Meeting-win32-x64",
  OUT/"FILE-O-Meeting-Windows-x64.zip",False),
 (HERE/"dist"/"FILE-O-Meeting-darwin-arm64",
  OUT/"FILE-O-Meeting-macOS-AppleSilicon.zip",True),
 (HERE/"dist"/"FILE-O-Meeting-darwin-x64",
  OUT/"FILE-O-Meeting-macOS-Intel.zip",True),
]

def write_entry(archive,filepath,arcname):
    mode=os.lstat(filepath).st_mode
    if stat.S_ISLNK(mode):
        info=zipfile.ZipInfo(str(arcname).replace("\\","/"))
        info.compress_type=zipfile.ZIP_STORED
        info.create_system=3
        info.external_attr=((stat.S_IFLNK|0o777) <<16)
        info.flag_bits|=0x800
        archive.writestr(info,os.readlink(filepath).encode("utf-8"))
    elif stat.S_ISREG(mode):
        archive.write(filepath,str(arcname).replace("\\","/"))
    elif stat.S_ISDIR(mode):
        pass
    else:
        raise RuntimeError("Unexpected package file type: "+str(filepath))

def pack_directory(root,out,mac):
    if not root.is_dir():raise RuntimeError("Missing packaged app: "+str(root))
    started=time.monotonic()
    total=0
    with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,
                         allowZip64=True) as archive:
        if mac:
            paths=[root/"FILE-O-Meeting.app",root/"README.txt"]
        else:
            paths=[root]
        for item in paths:
            if item.is_file():
                write_entry(archive,item,Path(item.name))
                total+=1
                continue
            parent=item.parent
            for base,dirs,files in os.walk(item,followlinks=False):
                for name in list(dirs):
                    path=Path(base)/name
                    if path.is_symlink():
                        write_entry(archive,path,path.relative_to(parent))
                        dirs.remove(name)
                        total+=1
                for name in files:
                    path=Path(base)/name
                    write_entry(archive,path,path.relative_to(parent))
                    total+=1
    size=out.stat().st_size
    with zipfile.ZipFile(out) as archive:
        assert archive.testzip() is None
        actual=archive.namelist()
        if mac:
            assert any(x.endswith("Contents/Info.plist") for x in actual)
            assert any("Contents/Frameworks" in x for x in actual)
            symlinks=[x for x in archive.infolist()
                if stat.S_ISLNK(x.external_attr >>16)]
            assert symlinks,"Mac framework symlinks lost during packaging"
            print("MAC_SYMLINKS",len(symlinks),flush=True)
        else:
            assert any(x.endswith("/FILE-O-Meeting.exe") for x in actual)
    digest=hashlib.sha256(out.read_bytes()).hexdigest()
    print("ZIP_READY",out.name,"files",total,
          "bytes",size,"seconds",round(time.monotonic()-started,1),
          "sha256",digest,flush=True)
    return f"{digest}  {out.name}"

lines=[]
for root,dst,mac in TARGETS:
    lines.append(pack_directory(root,dst,mac))
(OUT/"FILE-O-Meeting-SHA256.txt").write_text("\n".join(lines)+"\n",encoding="utf-8")
print("ALL_DESKTOP_RELEASES_READY",flush=True)
