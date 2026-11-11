/* シンプル操作 AI本格麻雀 — Raspberry Pi 用ネイティブ版(試作)
   C → SDL2 → Linux。ゲームの頭脳は JavaScript(QuickJS)のまま使い回す。
   使い方: ./mj <ゲームのフォルダ(mahjong)> [--shots 出力フォルダ] [--auto] [--frames N] */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <dirent.h>
#include <unistd.h>
#include <SDL.h>
#include <SDL_image.h>
#include <SDL_ttf.h>
#include <SDL_mixer.h>
#ifndef NO_VIDEO
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswresample/swresample.h>
#include <libswscale/swscale.h>
#include <libavutil/opt.h>
#include <libavutil/channel_layout.h>
#endif
#include "quickjs.h"
#include "shanten.h"

static SDL_Texture *tgt = NULL; static SDL_Texture *lay[6]; static SDL_Rect curview = { 0, 0, 832, 468 };
static SDL_Window *win; static SDL_Renderer *ren; static JSContext *ctx; static JSRuntime *rt;
static char root[1024] = "."; static int quitf = 0; static TTF_Font *fonts[64]; static int fsz[64]; static int nfonts = 0;
static char fontpath[1024];
#define W 832
#define H 468
static double nowms(void){ struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec*1000.0+t.tv_nsec/1e6; }

/* ---- 画像・文字のキャッシュ ---- */
typedef struct { char key[200]; unsigned hs; SDL_Texture *tex; int w, h; } Ent;
static unsigned hashs(const char *s){ unsigned h = 2166136261u; while (*s) { h ^= (unsigned char)*s++; h *= 16777619u; } return h; }
#define NIMG 480
#define NTXT 1200
static Ent imgs[NIMG]; static int nimg = 0; static Ent txts[NTXT]; static int ntxt = 0; static int txtnext = 0;
static SDL_Texture *getimg(const char *path, int *w, int *h){
  unsigned hp = hashs(path);
  for (int i = 0; i < nimg; i++) if (imgs[i].hs == hp && !strcmp(imgs[i].key, path)) { if (w) *w = imgs[i].w; if (h) *h = imgs[i].h; return imgs[i].tex; }
  if (nimg >= NIMG) return NULL;
  char full[1400]; if (path[0] == '/') snprintf(full, sizeof full, "%s", path); else snprintf(full, sizeof full, "%s/%s", root, path); /* 「/」から始まる名前は、そのままの場所(ビデオのサムネイル用) */
  if (!strncmp(path, "img/", 4)) { char alt[1400]; snprintf(alt, sizeof alt, "%s/native/img/%s", root, path + 4); FILE *tf = fopen(alt, "rb"); if (tf) { fclose(tf); strcpy(full, alt); } } /* 実機用に小さくした絵(native/img)が、あれば、そちらを使う */
  SDL_Surface *s = IMG_Load(full); if (!s) { fprintf(stderr, "img? %s (%s)\n", full, IMG_GetError()); return NULL; }
  SDL_Texture *t = SDL_CreateTextureFromSurface(ren, s);
  Ent *e = &imgs[nimg++]; e->hs = hp; strncpy(e->key, path, 199); e->tex = t; e->w = s->w; e->h = s->h; SDL_FreeSurface(s);
  if (w) *w = e->w; if (h) *h = e->h; return t;
}
/* 絵の形(透明でないところ)だけを、黄色一色にぬった絵。ボタンのふちを光らせるのに使う */
static SDL_Texture *getsil(const char *path, int *w, int *h){
  char key[260]; snprintf(key, sizeof key, "%.240s#sil", path); unsigned hp = hashs(key);
  for (int i = 0; i < nimg; i++) if (imgs[i].hs == hp && !strcmp(imgs[i].key, key)) { if (w) *w = imgs[i].w; if (h) *h = imgs[i].h; return imgs[i].tex; }
  if (nimg >= NIMG) return NULL;
  char full[1400]; snprintf(full, sizeof full, "%s/%s", root, path);
  SDL_Surface *s0 = IMG_Load(full); if (!s0) return NULL;
  SDL_Surface *s = SDL_ConvertSurfaceFormat(s0, SDL_PIXELFORMAT_ARGB8888, 0); SDL_FreeSurface(s0); if (!s) return NULL;
  SDL_LockSurface(s); for (int y = 0; y < s->h; y++) { Uint32 *row = (Uint32 *)((Uint8 *)s->pixels + y * s->pitch); for (int x = 0; x < s->w; x++) { Uint32 a = row[x] >> 24; row[x] = (a << 24) | (255u << 16) | (222u << 8) | 70u; } } SDL_UnlockSurface(s);
  SDL_Texture *t = SDL_CreateTextureFromSurface(ren, s);
  Ent *e = &imgs[nimg++]; e->hs = hp; strncpy(e->key, key, 199); e->tex = t; e->w = s->w; e->h = s->h; SDL_FreeSurface(s);
  if (w) *w = e->w; if (h) *h = e->h; return t;
}
static TTF_Font *getfont(int sz){
  for (int i = 0; i < nfonts; i++) if (fsz[i] == sz) return fonts[i];
  if (nfonts >= 64) return fonts[0];
  TTF_Font *f = TTF_OpenFont(fontpath, sz); if (!f) { fprintf(stderr, "font? %s\n", TTF_GetError()); return NULL; }
  fonts[nfonts] = f; fsz[nfonts++] = sz; return f;
}
static SDL_Texture *gettext(const char *s, int sz, int r, int g, int b, int *w, int *h){
  char key[200]; snprintf(key, sizeof key, "%d|%d,%d,%d|%.150s", sz, r, g, b, s);
  unsigned hk = hashs(key);
  for (int i = 0; i < ntxt; i++) if (txts[i].hs == hk && !strcmp(txts[i].key, key)) { *w = txts[i].w; *h = txts[i].h; return txts[i].tex; }
  TTF_Font *f = getfont(sz); if (!f) return NULL;
  SDL_Color c = { r, g, b, 255 }; SDL_Surface *su = TTF_RenderUTF8_Blended(f, s, c); if (!su) return NULL;
  SDL_Texture *t = SDL_CreateTextureFromSurface(ren, su);
  Ent *e; if (ntxt < NTXT) e = &txts[ntxt++]; else { e = &txts[txtnext]; txtnext = (txtnext + 1) % NTXT; if (e->tex) SDL_DestroyTexture(e->tex); } /* いっぱいになったら、古いものから1つずつ入れ替える(全部捨てて作り直すと、一瞬止まる) */
  e->hs = hk; strncpy(e->key, key, 199); e->tex = t; e->w = su->w; e->h = su->h; SDL_FreeSurface(su);
  *w = e->w; *h = e->h; return t;
}


/* ---- JS に渡す描画の道具 ---- */
static int ai(JSContext *c, JSValueConst v){ int32_t x = 0; JS_ToInt32(c, &x, v); return x; }
static JSValue j_fill(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); SDL_SetRenderDrawColor(ren, ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), n > 7 ? ai(c,a[7]) : 255); SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), ai(c,a[3]) }; SDL_RenderFillRect(ren, &r); return JS_UNDEFINED; }
static JSValue j_frame(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderDrawColor(ren, ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), 255); int th = n > 7 ? ai(c,a[7]) : 1; for (int i = 0; i < th; i++) { SDL_Rect r = { ai(c,a[0])+i, ai(c,a[1])+i, ai(c,a[2])-2*i, ai(c,a[3])-2*i }; SDL_RenderDrawRect(ren, &r); } return JS_UNDEFINED; }
static JSValue j_image(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  SDL_Rect d = { ai(c,a[1]), ai(c,a[2]), ai(c,a[3]), ai(c,a[4]) }; SDL_SetTextureAlphaMod(tx, n > 5 ? ai(c,a[5]) : 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_TRUE; }
static JSValue j_imagesil(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getsil(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  SDL_Rect d = { ai(c,a[1]), ai(c,a[2]), ai(c,a[3]), ai(c,a[4]) }; SDL_SetTextureAlphaMod(tx, n > 5 ? ai(c,a[5]) : 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_TRUE; }
typedef struct { int kind; SDL_Texture *tx; SDL_Rect d, sr; Uint8 r, g, b, a; } TopImg; static TopImg topq[160]; static int ntop = 0; /* kind: 0=絵 1=四角 2=文字(順番どおりに、最後に描く) */ /* 画面に出す直前に、窓の本当の解像度で描く絵(顔など。くっきり見せるため) */
static JSValue j_imagetop(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE; if (ntop >= 160) return JS_TRUE;
  TopImg *q = &topq[ntop++]; q->kind = 0; q->tx = tx; q->d.x = ai(c,a[1]) + curview.x; q->d.y = ai(c,a[2]) + curview.y; q->d.w = ai(c,a[3]); q->d.h = ai(c,a[4]);
  q->sr.x = 0; q->sr.y = 0; q->sr.w = w; q->sr.h = h; /* 縦横の比が合わないときは、ゆがめず、上をそろえて切り取る */
  if (q->d.w * h > q->d.h * w) q->sr.h = h * 0 + (int)((double)w * q->d.h / q->d.w); else if (q->d.w * h < q->d.h * w) { q->sr.w = (int)((double)h * q->d.w / q->d.h); q->sr.x = (w - q->sr.w) / 2; }
  SDL_Rect z = { 0, 0, 0, 0 }; (void)z; return JS_TRUE; }
static JSValue j_filltop(JSContext *c, JSValueConst t, int n, JSValueConst *a){ /* 絵(顔)より上に重ねる四角 */
  if (ntop >= 160) return JS_UNDEFINED; TopImg *q = &topq[ntop++]; q->kind = 1; q->tx = NULL; q->d.x = ai(c,a[0]) + curview.x; q->d.y = ai(c,a[1]) + curview.y; q->d.w = ai(c,a[2]); q->d.h = ai(c,a[3]); q->r = ai(c,a[4]); q->g = ai(c,a[5]); q->b = ai(c,a[6]); q->a = n > 7 ? ai(c,a[7]) : 255; return JS_UNDEFINED; }
static JSValue j_texttop(JSContext *c, JSValueConst t, int n, JSValueConst *a){ /* 絵(顔)より上に重ねる文字 */
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0, al = n > 7 ? ai(c,a[7]) : 0; SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx || ntop >= 160) return JS_NewInt32(c, 0);
  int x = ai(c,a[1]); if (al == 1) x -= w / 2; else if (al == 2) x -= w;
  TTF_Font *ft = getfont(ai(c,a[3])); int dyn = ft ? (int)(ai(c,a[3]) * 0.86) - TTF_FontAscent(ft) : 0;
  TopImg *q = &topq[ntop++]; q->kind = 2; q->tx = tx; q->d.x = x + curview.x; q->d.y = ai(c,a[2]) + dyn + curview.y; q->d.w = w; q->d.h = h; q->sr.x = 0; q->sr.y = 0; q->sr.w = w; q->sr.h = h; return JS_NewInt32(c, w); }
static JSValue j_text(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; int al = n > 7 ? ai(c,a[7]) : 0;
  SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx) return JS_NewInt32(c, 0);
  int x = ai(c,a[1]); if (al == 1) x -= w / 2; else if (al == 2) x -= w;
  TTF_Font *ft = getfont(ai(c,a[3])); int dyn = ft ? (int)(ai(c,a[3]) * 0.86) - TTF_FontAscent(ft) : 0; /* 漢字の字面の上端を y に合わせる(フォントごとの行の高さの違いで、下に寄らないように) */
  SDL_Rect d = { x, ai(c,a[2]) + dyn, w, h }; SDL_SetTextureAlphaMod(tx, 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_NewInt32(c, w); }
static JSValue j_imagerot(JSContext *c, JSValueConst t, int n, JSValueConst *a){ /* 回して描く: (x,y)は、回したあとの外枠の左上。w,hは、回す前の大きさ */
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  int x = ai(c,a[1]), y = ai(c,a[2]), dw = ai(c,a[3]), dh = ai(c,a[4]), ang = ai(c,a[6]); int bw = (ang == 90 || ang == 270) ? dh : dw, bh = (ang == 90 || ang == 270) ? dw : dh;
  SDL_Rect d = { x + bw / 2 - dw / 2, y + bh / 2 - dh / 2, dw, dh }; SDL_SetTextureAlphaMod(tx, ai(c,a[5])); SDL_RenderCopyEx(ren, tx, NULL, &d, (double)ang, NULL, SDL_FLIP_NONE); return JS_TRUE; }
static JSValue j_textrot(JSContext *c, JSValueConst t, int n, JSValueConst *a){ /* 回した文字: (cx,cy)を中心に */
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx) return JS_NewInt32(c, 0);
  TTF_Font *ft2 = getfont(ai(c,a[3])); int sz2 = ai(c,a[3]), off2 = ft2 ? (TTF_FontAscent(ft2) - (int)(sz2 * 0.38)) - h / 2 : 0; /* 字面の中心を、中心に合わせる */
  SDL_Rect d = { ai(c,a[1]) - w / 2, ai(c,a[2]) - h / 2, w, h }; SDL_SetTextureAlphaMod(tx, 255); SDL_RenderCopyEx(ren, tx, NULL, &d, (double)ai(c,a[7]), NULL, SDL_FLIP_NONE); return JS_NewInt32(c, w); }
static JSValue j_measure(JSContext *c, JSValueConst t, int n, JSValueConst *a){ const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; TTF_Font *f = getfont(ai(c,a[1])); if (f && s) TTF_SizeUTF8(f, s, &w, &h); JS_FreeCString(c, s); return JS_NewInt32(c, w); }
static JSValue j_clip(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (n < 4) { SDL_RenderSetClipRect(ren, NULL); return JS_UNDEFINED; } SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), ai(c,a[3]) }; SDL_RenderSetClipRect(ren, &r); return JS_UNDEFINED; }
static JSValue j_view(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), W - ai(c,a[0]), H - ai(c,a[1]) }; curview = r; SDL_RenderSetViewport(ren, &r); return JS_UNDEFINED; }
/* 描いた絵を、1枚の絵(層)にためておき、あとは貼るだけにする(動かない部分の描き直しを省く) */
static JSValue j_layerbegin(JSContext *c, JSValueConst t, int n, JSValueConst *a){ int i = ai(c,a[0]); if (i < 0 || i >= 6) return JS_UNDEFINED; if (!lay[i]) { lay[i] = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_TARGET, W, H); SDL_SetTextureBlendMode(lay[i], SDL_BLENDMODE_BLEND); } SDL_SetRenderTarget(ren, lay[i]); SDL_RenderSetViewport(ren, NULL); SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_NONE); SDL_SetRenderDrawColor(ren, 0, 0, 0, 0); SDL_RenderClear(ren); SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); return JS_UNDEFINED; }
static JSValue j_layerend(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderTarget(ren, tgt); SDL_RenderSetViewport(ren, &curview); return JS_UNDEFINED; }
static JSValue j_layer(JSContext *c, JSValueConst t, int n, JSValueConst *a){ int i = ai(c,a[0]); if (i < 0 || i >= 6 || !lay[i]) return JS_UNDEFINED; SDL_Rect d = { 0, 0, W, H }; SDL_RenderCopy(ren, lay[i], NULL, &d); return JS_UNDEFINED; } /* 描く原点を動かす(画面の外側は切れる) */
static JSValue j_clear(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderDrawColor(ren, ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), 255); SDL_RenderClear(ren); return JS_UNDEFINED; }
static JSValue j_present(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_RenderPresent(ren); return JS_UNDEFINED; }
static JSValue j_shot(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *p = JS_ToCString(c, a[0]); int ow, oh; SDL_GetRendererOutputSize(ren, &ow, &oh); SDL_Surface *s = SDL_CreateRGBSurfaceWithFormat(0, ow, oh, 32, SDL_PIXELFORMAT_ARGB8888);
  SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, s->pixels, s->pitch); SDL_SaveBMP(s, p); SDL_FreeSurface(s); JS_FreeCString(c, p); return JS_UNDEFINED; }
static JSValue j_print(JSContext *c, JSValueConst t, int n, JSValueConst *a){ for (int i = 0; i < n; i++) { const char *s = JS_ToCString(c, a[i]); if (s) { printf("%s%s", i ? " " : "", s); JS_FreeCString(c, s); } } printf("\n"); fflush(stdout); return JS_UNDEFINED; }
static JSValue j_now(JSContext *c, JSValueConst t, int n, JSValueConst *a){ return JS_NewFloat64(c, nowms()); }
static JSValue j_quit(JSContext *c, JSValueConst t, int n, JSValueConst *a){ quitf = 1; return JS_UNDEFINED; }
/* 保存(成績など): <root>/save.json を読み書き */
static JSValue j_load(JSContext *c, JSValueConst t, int n, JSValueConst *a){ char p[1500]; snprintf(p, sizeof p, "%s/save.json", root); FILE *f = fopen(p, "rb"); if (!f) return JS_NULL; fseek(f, 0, SEEK_END); long L = ftell(f); fseek(f, 0, SEEK_SET); char *b = malloc(L + 1); fread(b, 1, L, f); b[L] = 0; fclose(f); JSValue v = JS_NewString(c, b); free(b); return v; }
static JSValue j_save(JSContext *c, JSValueConst t, int n, JSValueConst *a){ char p[1500], q[1520]; snprintf(p, sizeof p, "%s/save.json", root); snprintf(q, sizeof q, "%s.tmp", p); const char *s = JS_ToCString(c, a[0]); FILE *f = fopen(q, "wb"); if (f && s) { fwrite(s, 1, strlen(s), f); fclose(f); rename(q, p); } JS_FreeCString(c, s); return JS_UNDEFINED; }


/* ---- 音(SDL_mixer): 効果音・声は短い音をキャッシュ、BGMはストリーム ---- */
typedef struct { char key[200]; Mix_Chunk *ch; double len; } Snd;
#define NSND 400
static Snd snds[NSND]; static int nsnd = 0; static Mix_Music *bgm = NULL; static int audio_ok = 0; static double mvol = 1.0;
static Snd *getsnd(const char *path){
  for (int i = 0; i < nsnd; i++) if (!strcmp(snds[i].key, path)) return snds[i].ch ? &snds[i] : NULL;
  if (nsnd >= NSND) return NULL;
  char full[1400]; snprintf(full, sizeof full, "%s/%s", root, path);
  Snd *e = &snds[nsnd++]; strncpy(e->key, path, 199); e->ch = Mix_LoadWAV(full); e->len = 0;
  if (!e->ch) { fprintf(stderr, "snd? %s (%s)\n", full, Mix_GetError()); return NULL; }
  int fr, ch; Uint16 fm; Mix_QuerySpec(&fr, &fm, &ch); int bps = (fm & 0xFF) / 8; e->len = (double)e->ch->alen / (fr * ch * bps);
  return e;
}
static JSValue j_play(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  if (!audio_ok) return JS_NewFloat64(c, 0);
  const char *p = JS_ToCString(c, a[0]); double v = 1.0; if (n > 1) JS_ToFloat64(c, &v, a[1]);
  Snd *e = getsnd(p); JS_FreeCString(c, p); if (!e) return JS_NewFloat64(c, 0);
  int chn = Mix_PlayChannel(-1, e->ch, 0); if (chn >= 0) Mix_Volume(chn, (int)(v * 128)); return JS_NewFloat64(c, e->len); }
static JSValue j_len(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (!audio_ok) return JS_NewFloat64(c, 0); const char *p = JS_ToCString(c, a[0]); Snd *e = getsnd(p); JS_FreeCString(c, p); return JS_NewFloat64(c, e ? e->len : 0); }
static JSValue j_stopall(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (audio_ok) Mix_HaltChannel(-1); return JS_UNDEFINED; }
static JSValue j_music(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  if (!audio_ok) return JS_UNDEFINED;
  const char *p = JS_ToCString(c, a[0]); int loop = n > 1 ? JS_ToBool(c, a[1]) : 1;
  if (bgm) { Mix_HaltMusic(); Mix_FreeMusic(bgm); bgm = NULL; }
  if (p && *p) { char full[1400]; snprintf(full, sizeof full, "%s/%s", root, p); bgm = Mix_LoadMUS(full); if (!bgm) fprintf(stderr, "bgm? %s (%s)\n", full, Mix_GetError()); else Mix_PlayMusic(bgm, loop ? -1 : 1); }
  JS_FreeCString(c, p); return JS_UNDEFINED; }
static JSValue j_mvol(JSContext *c, JSValueConst t, int n, JSValueConst *a){ double v = 1; JS_ToFloat64(c, &v, a[0]); if (audio_ok) Mix_VolumeMusic((int)(v * 128)); return JS_UNDEFINED; }
static JSValue j_readtext(JSContext *c, JSValueConst t, int n, JSValueConst *a){ const char *p = JS_ToCString(c, a[0]); char full[1400]; snprintf(full, sizeof full, "%s/%s", root, p); JS_FreeCString(c, p); FILE *f = fopen(full, "rb"); if (!f) return JS_NULL; fseek(f, 0, SEEK_END); long L = ftell(f); fseek(f, 0, SEEK_SET); char *b = malloc(L + 1); fread(b, 1, L, f); b[L] = 0; fclose(f); JSValue v = JS_NewString(c, b); free(b); return v; }
#include "video.h"

/* ---- 起動時の読み込み: 画像と効果音を先に読み、「起動中」の画面に進み具合を出す(初回プレイ中の、読み込みによる止まりを避ける) ---- */
static int cmpstr(const void *a, const void *b){ return strcmp(*(char *const *)a, *(char *const *)b); }
static int listdir(const char *sub, const char *ext, char **out, int max, int n){
  char d[1400]; snprintf(d, sizeof d, "%s/%s", root, sub); DIR *dp = opendir(d); if (!dp) return n;
  struct dirent *de; while ((de = readdir(dp)) && n < max) { size_t L = strlen(de->d_name), E = strlen(ext); if (L > E && !strcmp(de->d_name + L - E, ext)) { char p[300]; snprintf(p, sizeof p, "%s/%s", sub, de->d_name); out[n++] = strdup(p); } }
  closedir(dp); return n; }
static void loading_screen(int done, int total){
  SDL_SetRenderTarget(ren, NULL); SDL_SetRenderDrawColor(ren, 14, 60, 44, 255); SDL_RenderClear(ren);
  int w, h; SDL_Texture *bg = getimg("img/boot.webp", &w, &h);
  if (bg) { SDL_Rect d = { 0, 0, W, H }; SDL_RenderCopy(ren, bg, NULL, &d); }
  else { SDL_Texture *t = gettext("麻雀ゲーム 起動中", 40, 255, 240, 200, &w, &h); if (t) { SDL_Rect d = { (W - w) / 2, 130, w, h }; SDL_RenderCopy(ren, t, NULL, &d); } }
  SDL_SetRenderDrawColor(ren, 20, 50, 38, 255); SDL_Rect bar = { (W - 300) / 2, 300, 300, 6 }; SDL_RenderFillRect(ren, &bar);
  SDL_SetRenderDrawColor(ren, 222, 184, 96, 255); SDL_Rect fg = { (W - 300) / 2, 300, total ? 300 * done / total : 0, 6 }; SDL_RenderFillRect(ren, &fg);
  SDL_RenderPresent(ren); }
static void preload(void){
  static char *list[1200]; int n = 0;
  n = listdir("img", ".webp", list, 1200, n); n = listdir("img/tiles", ".webp", list, 1200, n); n = listdir("img/chars", ".webp", list, 1200, n); n = listdir("img/chars/face", ".webp", list, 1200, n);
  n = listdir("img/you", ".webp", list, 1200, n); n = listdir("img/teacher", ".webp", list, 1200, n);
  { const char *st = getenv("MJ_STYLE"); if (st && !strcmp(st, "old")) n = listdir("img/zunda", ".webp", list, 1200, n); else { n = listdir("img/uk", ".webp", list, 1200, n); n = listdir("img/uk/chars/face", ".webp", list, 1200, n); n = listdir("img/uk/zunda", ".webp", list, 1200, n); } } /* 浮世絵版(ふだん) / MJ_STYLE=old で、前のバージョンの絵 */
  int nimgs = n; n = listdir("audio/sfx", ".wav", list, 1200, n);
  qsort(list, n, sizeof(char *), cmpstr);
  double t0 = nowms(); int last = -1;
  for (int i = 0; i < n; i++) {
    if (strstr(list[i], "/cert") || strstr(list[i], "/tenbo_")) continue; /* 実機では使わない絵は、読まない(起動を速く) */
    size_t L = strlen(list[i]); if (L > 4 && !strcmp(list[i] + L - 4, ".wav")) { if (audio_ok) (void)getsnd(list[i]); } else getimg(list[i], NULL, NULL);
    SDL_PumpEvents(); int pc = i * 20 / (n ? n : 1); if (pc != last) { last = pc; loading_screen(i, n); }
  }
  (void)nimgs; loading_screen(n, n); printf("preload: %d files, %.0fms\n", n, nowms() - t0); fflush(stdout);
  for (int i = 0; i < n; i++) free(list[i]);
}


static char *readfile(const char *p, size_t *n){ FILE *f = fopen(p, "rb"); if (!f) return NULL; fseek(f, 0, SEEK_END); long L = ftell(f); fseek(f, 0, SEEK_SET); char *b = malloc(L + 1); fread(b, 1, L, f); b[L] = 0; fclose(f); *n = L; return b; }

/* ---- セーブの置き場(microSDなど): 環境変数 MJ_DATA、なければ ~/mjdata。save_<連番>.json を、最新から数件ぶん持つ。書くときは、別名で書いてから名前を変える(途中で電源が切れても、前のものは壊れない) ---- */
static char datadir[1200];
static void initdata(void){ const char *d = getenv("MJ_DATA"); if (d && *d) strncpy(datadir, d, sizeof datadir - 1); else { const char *h = getenv("HOME"); snprintf(datadir, sizeof datadir, "%s/mjdata", h ? h : "."); } char cmd[1300]; snprintf(cmd, sizeof cmd, "mkdir -p '%s'", datadir); if (system(cmd)) {} }
static JSValue j_slotlist(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  JSValue arr = JS_NewArray(c); DIR *dp = opendir(datadir); if (!dp) return arr; int seqs[256], m = 0; struct dirent *de;
  while ((de = readdir(dp)) && m < 256) { int q; char tail[8]; if (sscanf(de->d_name, "save_%d.%7s", &q, tail) == 2 && !strcmp(tail, "json")) seqs[m++] = q; }
  closedir(dp); for (int i = 0; i < m; i++) for (int j = i + 1; j < m; j++) if (seqs[j] > seqs[i]) { int x = seqs[i]; seqs[i] = seqs[j]; seqs[j] = x; }
  for (int i = 0; i < m; i++) JS_SetPropertyUint32(c, arr, i, JS_NewInt32(c, seqs[i])); return arr; }
static JSValue j_slotload(JSContext *c, JSValueConst t, int n, JSValueConst *a){ char p[1500]; snprintf(p, sizeof p, "%s/save_%d.json", datadir, ai(c, a[0])); size_t L; char *b = readfile(p, &L); if (!b) return JS_NULL; JSValue v = JS_NewString(c, b); free(b); return v; }
static JSValue j_slotsave(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  char p[1500], q[1520]; snprintf(p, sizeof p, "%s/save_%d.json", datadir, ai(c, a[0])); snprintf(q, sizeof q, "%s.tmp", p); const char *s = JS_ToCString(c, a[1]); int ok = 0;
  FILE *f = fopen(q, "wb"); if (f && s) { size_t L = strlen(s); ok = fwrite(s, 1, L, f) == L; fflush(f); fsync(fileno(f)); fclose(f); if (ok) ok = rename(q, p) == 0; } JS_FreeCString(c, s); sync(); return JS_NewBool(c, ok); }
static JSValue j_slotdel(JSContext *c, JSValueConst t, int n, JSValueConst *a){ char p[1500]; snprintf(p, sizeof p, "%s/save_%d.json", datadir, ai(c, a[0])); remove(p); return JS_UNDEFINED; }
static JSValue j_shanten(JSContext *c, JSValueConst t, int n, JSValueConst *a){ int cc[34]; for (int i = 0; i < 34; i++) { JSValue v = JS_GetPropertyUint32(c, a[0], i); int32_t x = 0; JS_ToInt32(c, &x, v); JS_FreeValue(c, v); cc[i] = x; } return JS_NewInt32(c, sh_std(cc, ai(c, a[1]))); }
static void dump_err(JSContext *c){ JSValue e = JS_GetException(c); const char *m = JS_ToCString(c, e); JSValue st = JS_GetPropertyStr(c, e, "stack"); const char *ss = JS_ToCString(c, st); fprintf(stderr, "JS ERR: %s\n%s\n", m ? m : "?", ss ? ss : ""); }
static void jobs(void){ JSContext *c1; int r; do { r = JS_ExecutePendingJob(rt, &c1); if (r < 0) dump_err(c1); } while (r > 0); }
static void rejected(JSContext *c, JSValueConst p, JSValueConst reason, JS_BOOL handled, void *o){ if (handled) return; const char *m = JS_ToCString(c, reason); JSValue st = JS_GetPropertyStr(c, reason, "stack"); const char *ss = JS_ToCString(c, st); fprintf(stderr, "UNHANDLED: %s\n%s\n", m ? m : "?", ss ? ss : ""); }
static int evalfile(const char *p){ size_t n; char *s = readfile(p, &n); if (!s) { fprintf(stderr, "cannot read %s\n", p); return 1; }
  JSValue v = JS_Eval(ctx, s, n, p, JS_EVAL_TYPE_GLOBAL); free(s); if (JS_IsException(v)) { dump_err(ctx); return 2; } JS_FreeValue(ctx, v); jobs(); return 0; }
static void callkey(const char *k){ JSValue g = JS_GetGlobalObject(ctx); JSValue f = JS_GetPropertyStr(ctx, g, "__key"); JSValue a = JS_NewString(ctx, k); JSValue r = JS_Call(ctx, f, g, 1, &a); if (JS_IsException(r)) dump_err(ctx); JS_FreeValue(ctx, r); JS_FreeValue(ctx, a); JS_FreeValue(ctx, f); JS_FreeValue(ctx, g); jobs(); }
static int callframe(void){ JSValue g = JS_GetGlobalObject(ctx); JSValue f = JS_GetPropertyStr(ctx, g, "__frame"); JSValue a = JS_NewFloat64(ctx, nowms()); JSValue r = JS_Call(ctx, f, g, 1, &a); int d = 0; if (JS_IsException(r)) dump_err(ctx); else d = JS_ToBool(ctx, r); JS_FreeValue(ctx, r); JS_FreeValue(ctx, a); JS_FreeValue(ctx, f); JS_FreeValue(ctx, g); jobs(); return d; }

static void reg(JSValue o, const char *name, JSCFunction *f, int n){ JS_SetPropertyStr(ctx, o, name, JS_NewCFunction(ctx, f, name, n)); }
static const char *findfont(void){
  static const char *c[] = { "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/takao-gothic/TakaoGothic.ttf", NULL };
  for (int i = 0; c[i]; i++) { FILE *f = fopen(c[i], "rb"); if (f) { fclose(f); return c[i]; } } return NULL; }

static int swapab = 1; static JSValue j_swapab(JSContext *c, JSValueConst t, int n, JSValueConst *a){ swapab = ai(c,a[0]); return JS_UNDEFINED; }
static int held = 0; static double held_next = 0; static const char *HELD[5] = { "", "left", "right", "up", "down" }; /* 押しっぱなしの連続移動 */
static void setheld(int d){ held = d; held_next = nowms() + 380; }
static int axisdir[2] = { 0, 0 }; static int jb[32]; static double menu_t0 = 0;
static void joyaxis(int axis, int v){ int d = v > 16000 ? 1 : v < -16000 ? -1 : 0; if (axis > 1) return; if (d != axisdir[axis]) { axisdir[axis] = d; if (d) { callkey(axis == 0 ? (d > 0 ? "right" : "left") : (d > 0 ? "down" : "up")); setheld(axis == 0 ? (d > 0 ? 2 : 1) : (d > 0 ? 4 : 3)); } else held = 0; } }

static void handle_event(SDL_Event *ep){
  SDL_Event e = *ep;
  if (e.type == SDL_QUIT) quitf = 1;
  else if (e.type == SDL_JOYDEVICEADDED) SDL_JoystickOpen(e.jdevice.which);
  else if (e.type == SDL_KEYDOWN && !e.key.repeat) {
    switch (e.key.keysym.sym) {
      case SDLK_LEFT: callkey("left"); setheld(1); break; case SDLK_RIGHT: callkey("right"); setheld(2); break; case SDLK_UP: callkey("up"); setheld(3); break; case SDLK_DOWN: callkey("down"); setheld(4); break;
      case SDLK_RETURN: case SDLK_SPACE: case SDLK_z: callkey("ok"); break;
      case SDLK_ESCAPE: case SDLK_BACKSPACE: case SDLK_x: callkey("back"); break;
      case SDLK_q: if (e.key.keysym.mod & KMOD_CTRL) quitf = 1; break; }
  }
  else if (e.type == SDL_KEYUP) { int k = e.key.keysym.sym; if ((k == SDLK_LEFT && held == 1) || (k == SDLK_RIGHT && held == 2) || (k == SDLK_UP && held == 3) || (k == SDLK_DOWN && held == 4)) held = 0; }
  else if (e.type == SDL_JOYHATMOTION) { if (e.jhat.value & SDL_HAT_LEFT) { callkey("left"); setheld(1); } else if (e.jhat.value & SDL_HAT_RIGHT) { callkey("right"); setheld(2); } else if (e.jhat.value & SDL_HAT_UP) { callkey("up"); setheld(3); } else if (e.jhat.value & SDL_HAT_DOWN) { callkey("down"); setheld(4); } else held = 0; }
  else if (e.type == SDL_JOYAXISMOTION) joyaxis(e.jaxis.axis, e.jaxis.value);
  else if (e.type == SDL_JOYBUTTONUP) { if (e.jbutton.button < 32) jb[e.jbutton.button] = 0; }
  else if (e.type == SDL_JOYBUTTONDOWN) { if (e.jbutton.button < 32) jb[e.jbutton.button] = 1; { int b = e.jbutton.button; if (b >= 6 && b <= 9) return; /* スタート・セレクトは、長押しのメニュー専用 */ callkey((swapab ? (b == 0 || b == 2) : (b == 1 || b == 3)) ? "back" : "ok"); } }
}

int main(int argc, char **argv){
  const char *shots = NULL, *vplay = NULL; int auto_ = 0, maxframes = 0; char *files[64]; int nf = 0;
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--shots") && i + 1 < argc) shots = argv[++i];
    else if (!strcmp(argv[i], "--vplay") && i + 1 < argc) vplay = argv[++i];
    else if (!strcmp(argv[i], "--auto")) auto_ = 1;
    else if (!strcmp(argv[i], "--vtest") && i + 1 < argc) return vid_test(argv[i + 1]);
    else if (!strcmp(argv[i], "--frames") && i + 1 < argc) maxframes = atoi(argv[++i]);
    else if (i == 1) strncpy(root, argv[i], sizeof root - 1);
  }
  const char *fp = getenv("MJ_FONT"); if (!fp) fp = findfont(); if (!fp) { fprintf(stderr, "日本語フォントがありません: sudo apt install fonts-ipafont-gothic\n"); return 1; }
  strncpy(fontpath, fp, sizeof fontpath - 1);
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_JOYSTICK | SDL_INIT_EVENTS) < 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
  IMG_Init(IMG_INIT_WEBP | IMG_INIT_PNG); TTF_Init();
  if (!getenv("MJ_NOSOUND")) { if (SDL_InitSubSystem(SDL_INIT_AUDIO) == 0 && Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, getenv("MJ_ABUF") ? atoi(getenv("MJ_ABUF")) : 4096) == 0) { int mf = Mix_Init(MIX_INIT_MP3); Mix_AllocateChannels(16); audio_ok = 1; int fr, nc; Uint16 fm; Mix_QuerySpec(&fr, &fm, &nc); printf("audio: ok (driver=%s, %dHz, ch=%d, mp3=%s)\n", SDL_GetCurrentAudioDriver() ? SDL_GetCurrentAudioDriver() : "?", fr, nc, (mf & MIX_INIT_MP3) ? "ok" : "NG"); } else fprintf(stderr, "audio? %s\n", SDL_GetError()); }
  int windowed = getenv("MJ_WINDOWED") != NULL;
  win = SDL_CreateWindow("シンプル操作 AI本格麻雀", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, windowed ? 1080 : 0, windowed ? 642 : 0, windowed ? SDL_WINDOW_RESIZABLE : SDL_WINDOW_FULLSCREEN_DESKTOP);
  if (!win) { fprintf(stderr, "window: %s\n", SDL_GetError()); return 1; }
  ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_TARGETTEXTURE);
  if (!ren) ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_SOFTWARE);
  if (!ren) { fprintf(stderr, "renderer: %s\n", SDL_GetError()); return 1; }
  SDL_RenderSetLogicalSize(ren, W, H); SDL_ShowCursor(SDL_DISABLE);
  SDL_RendererInfo ri; SDL_GetRendererInfo(ren, &ri); printf("renderer: %s\n", ri.name);
  for (int i = 0; i < SDL_NumJoysticks(); i++) { SDL_JoystickOpen(i); }
  initdata(); preload();
  rt = JS_NewRuntime(); JS_SetMemoryLimit(rt, 192 * 1024 * 1024); JS_SetMaxStackSize(rt, 2 * 1024 * 1024); JS_SetHostPromiseRejectionTracker(rt, rejected, NULL);
  ctx = JS_NewContext(rt); JSValue g = JS_GetGlobalObject(ctx);
  JSValue gfx = JS_NewObject(ctx);
  reg(gfx, "fill", j_fill, 8); reg(gfx, "frame", j_frame, 8); reg(gfx, "image", j_image, 6); reg(gfx, "imageTop", j_imagetop, 5); reg(gfx, "fillTop", j_filltop, 8); reg(gfx, "textTop", j_texttop, 8); reg(gfx, "imageSil", j_imagesil, 6); reg(gfx, "text", j_text, 8); reg(gfx, "imageRot", j_imagerot, 7); reg(gfx, "textRot", j_textrot, 8); reg(gfx, "measure", j_measure, 2);
  reg(gfx, "clear", j_clear, 3); reg(gfx, "present", j_present, 0); reg(gfx, "view", j_view, 2); reg(gfx, "clip", j_clip, 4); reg(gfx, "layerBegin", j_layerbegin, 1); reg(gfx, "layerEnd", j_layerend, 0); reg(gfx, "layer", j_layer, 1); reg(gfx, "shot", j_shot, 1);
  JS_SetPropertyStr(ctx, g, "gfx", gfx);
  JSValue snd = JS_NewObject(ctx); reg(snd, "play", j_play, 2); reg(snd, "len", j_len, 1); reg(snd, "stopAll", j_stopall, 0); reg(snd, "music", j_music, 2); reg(snd, "musicVol", j_mvol, 1);
  JS_SetPropertyStr(ctx, g, "snd", snd); reg(g, "__readtext", j_readtext, 1); reg(g, "__readdir", j_readdir, 1); reg(g, "__vopen", j_vopen, 2); reg(g, "__vstate", j_vstate, 0); reg(g, "__vseek", j_vseek, 1); reg(g, "__vpause", j_vpause, 1); reg(g, "__vclose", j_vclose, 0); JS_SetPropertyStr(ctx, g, "__dataDir", JS_NewString(ctx, datadir));
  reg(g, "print", j_print, 1); reg(g, "__now", j_now, 0); reg(g, "__quit", j_quit, 0); reg(g, "__load", j_load, 0); reg(g, "__save", j_save, 1); reg(g, "__swapab", j_swapab, 1); reg(g, "__shanten", j_shanten, 2); reg(g, "__slotlist", j_slotlist, 0); reg(g, "__slotload", j_slotload, 1); reg(g, "__slotsave", j_slotsave, 2); reg(g, "__slotdel", j_slotdel, 1);
  { if (getenv("MJ_FPS")) JS_SetPropertyStr(ctx, g, "__perfEnv", JS_NewBool(ctx, 1)); }
  { const char *tp = getenv("MJ_TEACHER"); if (tp) JS_SetPropertyStr(ctx, g, "__teacherEnv", JS_NewString(ctx, tp)); }
  { const char *cp = getenv("MJ_CPU"); if (cp) JS_SetPropertyStr(ctx, g, "__cpuEnv", JS_NewString(ctx, cp)); }
  { const char *sy = getenv("MJ_STYLE"); if (sy) JS_SetPropertyStr(ctx, g, "__styleEnv", JS_NewString(ctx, sy)); } /* MJ_STYLE=old で、前のバージョン(浮世絵版の前)の絵に戻す */
  { const char *yo = getenv("MJ_YOU"); if (yo) JS_SetPropertyStr(ctx, g, "__youEnv", JS_NewString(ctx, yo)); } /* MJ_YOU=old で、前の「あなた」の絵に戻す */
  JS_SetPropertyStr(ctx, g, "__auto", JS_NewBool(ctx, auto_)); if (shots) JS_SetPropertyStr(ctx, g, "__shotDir", JS_NewString(ctx, shots));
  const char *list[] = { "native/app/prelude.js", "js/tiles.js", "js/rules.js", "js/forms.js", "js/chars.js", "js/ai.js", "js/coach.js", "js/game.js", "js/banter.js", "js/banter2.js", "js/chars2.js", "js/rank.js", "native/app/icon.js", "js/ruby.js", "js/drill.js", "native/app/stats.js", "native/app/learn.js", "native/app/dictdata.js", "native/app/nsnd.js", "native/app/nui.js", NULL };
  for (int i = 0; list[i]; i++) { char p[1500]; snprintf(p, sizeof p, "%s/%s", root, list[i]); if (evalfile(p)) return 3; }
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "1");
  tgt = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_TARGET, W, H);
  if (!tgt) { fprintf(stderr, "target: %s\n", SDL_GetError()); return 1; }
  if (vplay) { /* 動画だけの動作テスト(窓は出るが、ゲームは動かさない) */
    if (!vid_open(vplay, 0)) { printf("open NG\n"); return 1; }
    double t0 = nowms(); int shown = 0, seeked = 0; extern void vid_dbg(double);
    while (nowms() - t0 < 8000) { SDL_Event ee; while (SDL_PollEvent(&ee)); static int it = 0; it++; if (vid_update()) shown++; SDL_Delay(2);
      if (!seeked && nowms() - t0 > 4000) { seeked = 1; j_vseek(ctx, JS_UNDEFINED, 1, (JSValue[]){ JS_NewFloat64(ctx, 120) }); printf("seek -> 120\n"); }
      if (((int)(nowms() - t0)) % 1000 < 3) { JSValue st = j_vstate(ctx, JS_UNDEFINED, 0, NULL); JSValue p = JS_GetPropertyUint32(ctx, st, 0); double pos; JS_ToFloat64(ctx, &pos, p); printf("t=%.1f pos=%.2f shown=%d drop=%d\n", (nowms() - t0) / 1000, pos, shown, V.dropped); SDL_Delay(5); } }
    vid_close(); return 0; }
  int frames = 0, shotn = 0, keep = 0; double perf_t0 = nowms(), perf_draw = 0, perf_pres = 0, perf_logic = 0, perf_logicmax = 0; int perf_n = 0, perf_p = 0; int perf = getenv("MJ_PERF") != NULL;
  JSValue gg = JS_GetGlobalObject(ctx);
  while (!quitf) {
    SDL_Event e; int got = SDL_WaitEventTimeout(&e, (keep || vid_active()) ? 1 : 8);
    while (got) { handle_event(&e); got = SDL_PollEvent(&e); }
    { int both = (jb[8] && jb[9]) || (jb[6] && jb[7]); if (both) { if (!menu_t0) menu_t0 = nowms(); else if (menu_t0 > 0 && nowms() - menu_t0 > 1200) { callkey("menu"); menu_t0 = -1; } } else menu_t0 = 0; } /* スタート+セレクトを長押し: メニュー(終了など) */
    if (held && nowms() >= held_next) { callkey(HELD[held]); held_next = nowms() + 95; }
    if (vid_update() && keep < 1) keep = 1; /* 動画の新しい絵が来たら、画面に出す */
    double tl0 = nowms(); int need = callframe(); { double d = nowms() - tl0; perf_logic += d; if (d > perf_logicmax) perf_logicmax = d; }
    if (need) {
      double t0 = nowms(); SDL_SetRenderTarget(ren, tgt); ntop = 0;
      JSValue f = JS_GetPropertyStr(ctx, gg, "__draw"); JSValue r = JS_Call(ctx, f, gg, 0, NULL); if (JS_IsException(r)) dump_err(ctx); JS_FreeValue(ctx, r); JS_FreeValue(ctx, f); jobs();
      if (shots && frames % 10 == 0 && shotn < 40) { char p[1600]; snprintf(p, sizeof p, "%s/s%02d.bmp", shots, shotn++); SDL_Surface *su = SDL_CreateRGBSurfaceWithFormat(0, W, H, 32, SDL_PIXELFORMAT_ARGB8888); SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, su->pixels, su->pitch); SDL_SaveBMP(su, p); SDL_FreeSurface(su); }
      SDL_SetRenderTarget(ren, NULL); keep = 3; perf_draw += nowms() - t0; perf_n++;
    }
    if (keep > 0) { double t0 = nowms(); SDL_RenderClear(ren); SDL_RenderCopy(ren, tgt, NULL, NULL); vid_render(); for (int i = 0; i < ntop; i++) { if (topq[i].kind == 1) { SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); SDL_SetRenderDrawColor(ren, topq[i].r, topq[i].g, topq[i].b, topq[i].a); SDL_RenderFillRect(ren, &topq[i].d); } else { SDL_SetTextureAlphaMod(topq[i].tx, 255); SDL_RenderCopy(ren, topq[i].tx, &topq[i].sr, &topq[i].d); } } SDL_RenderPresent(ren); keep--; perf_pres += nowms() - t0; perf_p++; }
    frames++; if (maxframes && frames >= maxframes) break;
    if (perf && nowms() - perf_t0 > 3000) { printf("perf: 描く %.1fms(%d回) / 画面に出す %.1fms(%d回)\n", perf_n ? perf_draw / perf_n : 0, perf_n, perf_p ? perf_pres / perf_p : 0, perf_p); { long rss = 0; FILE *sf = fopen("/proc/self/statm", "r"); if (sf) { long a; if (fscanf(sf, "%ld %ld", &a, &rss) < 2) rss = 0; fclose(sf); } JSMemoryUsage mu; JS_ComputeMemoryUsage(rt, &mu); printf("perf2: 思考・進行 合計%.0fms 最大%.0fms / JS %ldMB / 全体 %ldMB / 絵%d 文字%d\n", perf_logic, perf_logicmax, (long)(mu.malloc_size / 1048576), rss * 4 / 1024, nimg, ntxt); } fflush(stdout); perf_t0 = nowms(); perf_draw = perf_pres = perf_logic = perf_logicmax = 0; perf_n = perf_p = 0; }
  }
  return 0;
}
