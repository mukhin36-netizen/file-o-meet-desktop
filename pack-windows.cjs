'use strict';
// FILE-O Meet Windows package: require a real x64 WASAPI loopback helper.
// An incomplete build must fail, not silently ship the old screen-capture path.
const path=require('node:path');
const fs=require('node:fs');
const {packager}=require('@electron/packager');
const base=__dirname;
const native=path.join(base,'native','bin','fileo-system-audio.exe');
const license=path.join(base,'native','windows','THIRD_PARTY_AUDIO.md');
for(const f of [native,license]){
  if(!fs.statSync(f,{throwIfNoEntry:false})?.isFile()){
    throw Error('Windows WASAPI binary or license missing: '+path.basename(f));
  }
}
const config={
  dir:base,
  name:'FILE-O-Meeting',
  platform:'win32',
  arch:'x64',
  out:path.join(base,'dist'),
  overwrite:true,
  icon:path.join(base,'assets','fileo.ico'),
  asar:true,
  prune:true,
  extraResource:[native,license],
  ignore:[/^\/dist($|\/)/,/^\/tests($|\/)/,/^\/store-assets($|\/)/,
          /^\/native($|\/)/,/^\/\.github($|\/)/,
          /^\/backups($|\/)/]
};
packager(config).then(paths=>{
  for(const dest of paths){
    const resource=path.join(dest,'resources','fileo-system-audio.exe');
    if(!fs.statSync(resource,{throwIfNoEntry:false})?.isFile())
      throw Error('WASAPI helper missing from built app.');
  }
  process.stdout.write('WINDOWS_MEET_PACKAGE_READY '+paths.join('; ')+'\n');
}).catch(error=>{
  process.stderr.write('WINDOWS_MEET_PACKAGE_FAILED '+error.message+'\n');
  process.exitCode=1;
});
