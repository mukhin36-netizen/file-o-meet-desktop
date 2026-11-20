'use strict';

/* FILE-O Meet — native macOS Core Audio Process Tap integration.
 * A pinned, separately signed AudioTee binary captures the *complete*
 * system mix as s16le mono PCM, 16 kHz. The parent app only forwards
 * short audio frames to its isolated renderer. It never stores raw PCM.
 * No screen/window/video stream or user-selected source is involved.
 */
const {spawn} = require('node:child_process');
const fs = require('node:fs');

class NativeSystemAudio {
  constructor({binary, onPCM, onLost, spawnProcess = spawn} = {}) {
    this.binary = binary;
    this.onPCM = onPCM || (() => {});
    this.onLost = onLost || (() => {});
    this.spawnProcess = spawnProcess;
    this.proc = null;
    this.ending = false;
    this.leftover = Buffer.alloc(0);
  }
  available() {
    return typeof this.binary === 'string' &&
      fs.existsSync(this.binary) && fs.statSync(this.binary).isFile();
  }
  async start() {
    if (this.proc) throw Error('Запись звука компьютера уже запущена.');
    if (!this.available()) {
      throw Error('Для записи системного звука требуется обновлённая FILE-O Meet 0.6.5 или новее. Обновите приложение.');
    }
    this.ending = false;
    this.leftover = Buffer.alloc(0);
    return new Promise((resolve, reject) => {
      let settled = false;
      let startTimer = null;
      const done = (error) => {
        if (settled) return;
        settled = true;
        if (startTimer) clearTimeout(startTimer);
        if (error) {
          this.stop();
          reject(error);
        } else {
          resolve({format:'s16le',sampleRate:16000,channels:1});
        }
      };
      let child;
      try {
        child = this.spawnProcess(this.binary, [
          '--sample-rate','16000','--chunk-duration','0.2'
        ],{stdio:['ignore','pipe','pipe'],windowsHide:true,env:{
          // No account tokens, credentials or sensitive site environment.
          PATH:'/usr/bin:/bin:/usr/sbin:/sbin',
          HOME:process.env.HOME||''
        }});
      }catch(_) {
        done(Error('Не удалось запустить нативный захват звука компьютера.'));
        return;
      }
      this.proc=child;
      // The initial macOS TCC prompt may remain visible until the user clicks
      // Allow. Do not start a server-side meeting before audio arrives.
      startTimer=setTimeout(() => done(Error(
        'macOS не предоставила системный звук. Разрешите «Запись только системного аудио» для FILE-O Meet и повторите попытку.'
      )),90000);
      child.stdout.on('data', part => {
        if (this.ending || this.proc!==child || !Buffer.isBuffer(part)) return;
        const input=this.leftover.length?
          Buffer.concat([this.leftover,part]):part;
        const count=input.length - input.length%2;
        this.leftover=input.subarray(count);
        if (count) {
          try {
            this.onPCM(input.subarray(0,count).toString('base64'));
            done();
          }catch(_) {
            done(Error('Не удалось передать системный звук в окно записи.'));
          }
        }
      });
      // Diagnostics from an untrusted system process are not printed,
      // shown verbatim or included in any server upload.
      child.stderr.on('data',() => {});
      child.once('error',() => done(Error(
        'Нативный захват звука недоступен. Переустановите подписанную версию FILE-O Meet.'
      )));
      child.once('exit',(code,signal) => {
        if (this.proc===child) this.proc=null;
        if (!settled) done(Error(
          'macOS остановила запись системного звука. Проверьте разрешение и выбранный аудиовыход.'
        ));
        else if (!this.ending) this.onLost({reason:'native_audio_stopped'});
      });
    });
  }
  stop() {
    this.ending=true;
    this.leftover=Buffer.alloc(0);
    const child=this.proc;
    this.proc=null;
    if (child && !child.killed) {
      try { child.kill('SIGTERM'); }catch(_){}
    }
  }
}

module.exports={NativeSystemAudio};
