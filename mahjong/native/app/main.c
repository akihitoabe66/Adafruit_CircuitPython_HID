/* シンプル操作 AI本格麻雀 — Raspberry Pi 用ネイティブ版(試作)
   C → SDL2 → Linux。ゲームの頭脳は JavaScript(QuickJS)のまま使い回す。
   使い方: ./mj <ゲームのフォルダ(mahjong)> [--shots 出力フォルダ] [--auto] [--frames N] */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <dirent.h>
#include <unistd.h>
#include <signal.h>
#include <fcntl.h>
#include <execinfo.h>
#include <sys/resource.h>
#include <sys/syscall.h>
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

static SDL_Texture *tgt = NULL; static SDL_Texture *lay[32];  /* 画面の絵のキャッシュ(0〜3は対局の卓、4〜19は 動かないページ用) */ static SDL_Rect curview = { 0, 0, 832, 468 };
static SDL_Window *win; static SDL_Renderer *ren; static JSContext *ctx; static JSRuntime *rt;
static char root[1024] = "."; static int quitf = 0; static TTF_Font *fonts[200]; static int fsz[200]; static int nfonts = 0;
static char fontpath[1024];
#define W 832
#define H 468
static double nowms(void){ struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec*1000.0+t.tv_nsec/1e6; }

/* ---- 画像・文字のキャッシュ ---- */
typedef struct { char key[200]; unsigned hs; SDL_Texture *tex; int w, h; } Ent;
static unsigned hashs(const char *s){ unsigned h = 2166136261u; while (*s) { h ^= (unsigned char)*s++; h *= 16777619u; } return h; }
#define NIMG 760
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
static TTF_Font *getfont(int sz){ /* sz がマイナスのときは、太字(字の大きさ = -sz) */
  for (int i = 0; i < nfonts; i++) if (fsz[i] == sz) return fonts[i];
  if (nfonts >= 200) { int best = 0, bd = 1 << 30; for (int i = 0; i < nfonts; i++) { int d = abs(abs(fsz[i]) - abs(sz)) * 4 + ((fsz[i] < 0) != (sz < 0)); if (d < bd) { bd = d; best = i; } } return fonts[best]; } /* いっぱいのときは、いちばん近い大きさの字を使う(小さな字にならないように) */
  TTF_Font *f = TTF_OpenFont(fontpath, sz < 0 ? -sz : sz); if (f && sz < 0) TTF_SetFontStyle(f, TTF_STYLE_BOLD); if (!f) { fprintf(stderr, "font? %s\n", TTF_GetError()); return NULL; }
  fonts[nfonts] = f; fsz[nfonts++] = sz; return f;
}
static volatile int g_dry = 0; /* 1のあいだは、絵を描かずに、文字の下ごしらえ(キャッシュ)だけする */
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
static JSValue j_dry(JSContext *c, JSValueConst t, int n, JSValueConst *a){ g_dry = n > 0 ? ai(c,a[0]) : 0; return JS_UNDEFINED; }
static JSValue j_rrect(JSContext *c, JSValueConst t, int n, JSValueConst *a){ /* 角の丸い四角を、1回の呼び出しで(JSの rrect と同じ形・なめらかな縁) */
  if (g_dry) return JS_UNDEFINED;
  int x = ai(c,a[0]), y = ai(c,a[1]), w = ai(c,a[2]), h = ai(c,a[3]), r = ai(c,a[4]), cr = ai(c,a[5]), cg = ai(c,a[6]), cb = ai(c,a[7]), al = n > 8 ? ai(c,a[8]) : 255;
  if (r > h / 2) r = h / 2; if (r > w / 2) r = w / 2; if (r < 0) r = 0;
  SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND);
  for (int dy = 0; dy < r; dy++) {
    double d = r - dy - 0.5, q = (double)r * r - d * d; if (q < 0) q = 0; double xo = r - sqrt(q); int xi = (int)ceil(xo - 1e-6); double cov = xi - xo;
    SDL_SetRenderDrawColor(ren, cr, cg, cb, al);
    SDL_Rect r1 = { x + xi, y + dy, w - 2 * xi, 1 }, r2 = { x + xi, y + h - 1 - dy, w - 2 * xi, 1 }; SDL_RenderFillRect(ren, &r1); SDL_RenderFillRect(ren, &r2);
    if (cov > 0.04 && xi >= 1) { int aa = (int)floor(al * cov + 0.5); SDL_SetRenderDrawColor(ren, cr, cg, cb, aa);
      SDL_Rect p1 = { x + xi - 1, y + dy, 1, 1 }, p2 = { x + w - xi, y + dy, 1, 1 }, p3 = { x + xi - 1, y + h - 1 - dy, 1, 1 }, p4 = { x + w - xi, y + h - 1 - dy, 1, 1 };
      SDL_RenderFillRect(ren, &p1); SDL_RenderFillRect(ren, &p2); SDL_RenderFillRect(ren, &p3); SDL_RenderFillRect(ren, &p4); }
  }
  SDL_SetRenderDrawColor(ren, cr, cg, cb, al); SDL_Rect m = { x, y + r, w, h - 2 * r }; SDL_RenderFillRect(ren, &m); return JS_UNDEFINED; }
static JSValue j_fill(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); SDL_SetRenderDrawColor(ren, ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), n > 7 ? ai(c,a[7]) : 255); SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), ai(c,a[3]) }; SDL_RenderFillRect(ren, &r); return JS_UNDEFINED; }
static JSValue j_frame(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; SDL_SetRenderDrawColor(ren, ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), 255); int th = n > 7 ? ai(c,a[7]) : 1; for (int i = 0; i < th; i++) { SDL_Rect r = { ai(c,a[0])+i, ai(c,a[1])+i, ai(c,a[2])-2*i, ai(c,a[3])-2*i }; SDL_RenderDrawRect(ren, &r); } return JS_UNDEFINED; }
static JSValue j_image(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED;
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  SDL_Rect d = { ai(c,a[1]), ai(c,a[2]), ai(c,a[3]), ai(c,a[4]) }; SDL_SetTextureAlphaMod(tx, n > 5 ? ai(c,a[5]) : 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_TRUE; }
static JSValue j_imagesil(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED;
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getsil(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  SDL_Rect d = { ai(c,a[1]), ai(c,a[2]), ai(c,a[3]), ai(c,a[4]) }; SDL_SetTextureAlphaMod(tx, n > 5 ? ai(c,a[5]) : 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_TRUE; }
typedef struct { int kind; SDL_Texture *tx; SDL_Rect d, sr; Uint8 r, g, b, a; double ang; } TopImg; static TopImg topq[160]; static int ntop = 0; /* kind: 0=絵 1=四角 2=文字(順番どおりに、最後に描く) */ /* 画面に出す直前に、窓の本当の解像度で描く絵(顔など。くっきり見せるため) */
static JSValue j_imagetop(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED;
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE; if (ntop >= 160) return JS_TRUE;
  TopImg *q = &topq[ntop++]; q->kind = 0; q->a = 255; q->ang = 0; q->tx = tx; q->d.x = ai(c,a[1]) + curview.x; q->d.y = ai(c,a[2]) + curview.y; q->d.w = ai(c,a[3]); q->d.h = ai(c,a[4]);
  q->sr.x = 0; q->sr.y = 0; q->sr.w = w; q->sr.h = h; /* 縦横の比が合わないときは、ゆがめず、上をそろえて切り取る */
  if (q->d.w * h > q->d.h * w) q->sr.h = h * 0 + (int)((double)w * q->d.h / q->d.w); else if (q->d.w * h < q->d.h * w) { q->sr.w = (int)((double)h * q->d.w / q->d.h); q->sr.x = (w - q->sr.w) / 2; }
  SDL_Rect z = { 0, 0, 0, 0 }; (void)z; return JS_TRUE; }
static JSValue j_imagerottop(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; /* 絵(顔)より上に、回して・半透明で重ねる絵: (中心x, 中心y, 幅, 高さ, 不透明度0..255, 角度(度)) */
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE; if (ntop >= 160) return JS_TRUE;
  double cx, cy, ang; JS_ToFloat64(c, &cx, a[1]); JS_ToFloat64(c, &cy, a[2]); JS_ToFloat64(c, &ang, a[6]); int dw = ai(c,a[3]), dh = ai(c,a[4]);
  SDL_SetTextureScaleMode(tx, SDL_ScaleModeLinear); /* 回すと ギザギザにならないように */
  TopImg *q = &topq[ntop++]; q->kind = 0; q->tx = tx; q->a = (Uint8)ai(c,a[5]); q->ang = ang; q->d.w = dw; q->d.h = dh; q->d.x = (int)(cx - dw / 2.0) + curview.x; q->d.y = (int)(cy - dh / 2.0) + curview.y; q->sr.x = 0; q->sr.y = 0; q->sr.w = w; q->sr.h = h; return JS_TRUE; }
static JSValue j_filltop(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; /* 絵(顔)より上に重ねる四角 */
  if (ntop >= 160) return JS_UNDEFINED; TopImg *q = &topq[ntop++]; q->kind = 1; q->tx = NULL; q->d.x = ai(c,a[0]) + curview.x; q->d.y = ai(c,a[1]) + curview.y; q->d.w = ai(c,a[2]); q->d.h = ai(c,a[3]); q->r = ai(c,a[4]); q->g = ai(c,a[5]); q->b = ai(c,a[6]); q->a = n > 7 ? ai(c,a[7]) : 255; return JS_UNDEFINED; }
static JSValue j_texttop(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; /* 絵(顔)より上に重ねる文字 */
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0, al = n > 7 ? ai(c,a[7]) : 0; SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx || ntop >= 160) return JS_NewInt32(c, 0);
  int x = ai(c,a[1]); if (al == 1) x -= w / 2; else if (al == 2) x -= w;
  TTF_Font *ft = getfont(ai(c,a[3])); int dyn = ft ? (int)(abs(ai(c,a[3])) * 0.86) - TTF_FontAscent(ft) : 0;
  TopImg *q = &topq[ntop++]; q->kind = 2; q->tx = tx; q->d.x = x + curview.x; q->d.y = ai(c,a[2]) + dyn + curview.y; q->d.w = w; q->d.h = h; q->sr.x = 0; q->sr.y = 0; q->sr.w = w; q->sr.h = h; return JS_NewInt32(c, w); }
static JSValue j_text(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; int al = n > 7 ? ai(c,a[7]) : 0;
  SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx) return JS_NewInt32(c, 0);
  if (g_dry) return JS_NewInt32(c, w);
  int x = ai(c,a[1]); if (al == 1) x -= w / 2; else if (al == 2) x -= w;
  TTF_Font *ft = getfont(ai(c,a[3])); int dyn = ft ? (int)(abs(ai(c,a[3])) * 0.86) - TTF_FontAscent(ft) : 0; /* 漢字の字面の上端を y に合わせる(フォントごとの行の高さの違いで、下に寄らないように) */
  SDL_Rect d = { x, ai(c,a[2]) + dyn, w, h }; SDL_SetTextureAlphaMod(tx, 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_NewInt32(c, w); }
static JSValue j_imagerot(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; /* 回して描く: (x,y)は、回したあとの外枠の左上。w,hは、回す前の大きさ */
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  int x = ai(c,a[1]), y = ai(c,a[2]), dw = ai(c,a[3]), dh = ai(c,a[4]), ang = ai(c,a[6]); int bw = (ang == 90 || ang == 270) ? dh : dw, bh = (ang == 90 || ang == 270) ? dw : dh;
  SDL_Rect d = { x + bw / 2 - dw / 2, y + bh / 2 - dh / 2, dw, dh }; SDL_SetTextureAlphaMod(tx, ai(c,a[5])); SDL_RenderCopyEx(ren, tx, NULL, &d, (double)ang, NULL, SDL_FLIP_NONE); return JS_TRUE; }
static JSValue j_textrot(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; /* 回した文字: (cx,cy)を中心に */
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx) return JS_NewInt32(c, 0);
  TTF_Font *ft2 = getfont(ai(c,a[3])); int sz2 = ai(c,a[3]), off2 = ft2 ? (TTF_FontAscent(ft2) - (int)(sz2 * 0.38)) - h / 2 : 0; /* 字面の中心を、中心に合わせる */
  SDL_Rect d = { ai(c,a[1]) - w / 2, ai(c,a[2]) - h / 2, w, h }; SDL_SetTextureAlphaMod(tx, 255); SDL_RenderCopyEx(ren, tx, NULL, &d, (double)ai(c,a[7]), NULL, SDL_FLIP_NONE); return JS_NewInt32(c, w); }
static JSValue j_measure(JSContext *c, JSValueConst t, int n, JSValueConst *a){ const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; TTF_Font *f = getfont(ai(c,a[1])); if (f && s) TTF_SizeUTF8(f, s, &w, &h); JS_FreeCString(c, s); return JS_NewInt32(c, w); }
static JSValue j_clip(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (n < 4) { SDL_RenderSetClipRect(ren, NULL); return JS_UNDEFINED; } SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), ai(c,a[3]) }; SDL_RenderSetClipRect(ren, &r); return JS_UNDEFINED; }
static JSValue j_view(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), W - ai(c,a[0]), H - ai(c,a[1]) }; curview = r; SDL_RenderSetViewport(ren, &r); return JS_UNDEFINED; }
/* 描いた絵を、1枚の絵(層)にためておき、あとは貼るだけにする(動かない部分の描き直しを省く) */
static SDL_Texture *lay_prev = NULL; static int lay_in = 0; /* 面に描く前の描き先(終わったら、そこへ戻す) */
static JSValue j_layerbegin(JSContext *c, JSValueConst t, int n, JSValueConst *a){ int i = ai(c,a[0]); if (i < 0 || i >= 32) return JS_UNDEFINED; if (!lay[i]) { lay[i] = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_TARGET, W, H); SDL_SetTextureBlendMode(lay[i], SDL_BLENDMODE_BLEND); } if (!lay_in) lay_prev = SDL_GetRenderTarget(ren); lay_in = 1; SDL_SetRenderTarget(ren, lay[i]); SDL_RenderSetViewport(ren, NULL); SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_NONE); SDL_SetRenderDrawColor(ren, 0, 0, 0, 0); SDL_RenderClear(ren); SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); return JS_UNDEFINED; }
static JSValue j_layerend(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderTarget(ren, lay_in ? lay_prev : tgt); lay_in = 0; SDL_RenderSetViewport(ren, &curview); return JS_UNDEFINED; }
static JSValue j_layer(JSContext *c, JSValueConst t, int n, JSValueConst *a){ int i = ai(c,a[0]); if (i < 0 || i >= 32 || !lay[i]) return JS_UNDEFINED; SDL_Rect d = { 0, 0, W, H }; SDL_RenderCopy(ren, lay[i], NULL, &d); return JS_UNDEFINED; } /* 描く原点を動かす(画面の外側は切れる) */
static JSValue j_clear(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (g_dry) return JS_UNDEFINED; SDL_SetRenderDrawColor(ren, ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), 255); SDL_RenderClear(ren); return JS_UNDEFINED; }
static JSValue j_present(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_RenderPresent(ren); return JS_UNDEFINED; }
static char snappath[1600]; /* 試験用: gfx.snap(パス) で、次に画面に出す絵(顔・文字も入った完成形)を保存する */
static JSValue j_snap(JSContext *c, JSValueConst t, int n, JSValueConst *a){ const char *p = JS_ToCString(c, a[0]); if (p) { snprintf(snappath, sizeof snappath, "%s", p); JS_FreeCString(c, p); } return JS_UNDEFINED; }
static JSValue j_shot(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *p = JS_ToCString(c, a[0]); int ow, oh; SDL_GetRendererOutputSize(ren, &ow, &oh); SDL_Surface *s = SDL_CreateRGBSurfaceWithFormat(0, ow, oh, 32, SDL_PIXELFORMAT_ARGB8888);
  SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, s->pixels, s->pitch); SDL_SaveBMP(s, p); SDL_FreeSurface(s); JS_FreeCString(c, p); return JS_UNDEFINED; }
static JSValue j_print(JSContext *c, JSValueConst t, int n, JSValueConst *a){ for (int i = 0; i < n; i++) { const char *s = JS_ToCString(c, a[i]); if (s) { printf("%s%s", i ? " " : "", s); JS_FreeCString(c, s); } } printf("\n"); fflush(stdout); return JS_UNDEFINED; }
static JSValue j_now(JSContext *c, JSValueConst t, int n, JSValueConst *a){ return JS_NewFloat64(c, nowms()); }
static JSValue j_quit(JSContext *c, JSValueConst t, int n, JSValueConst *a){ quitf = 1; return JS_UNDEFINED; }
/* 保存(成績など): <root>/save.json を読み書き */
static JSValue j_load(JSContext *c, JSValueConst t, int n, JSValueConst *a){ char p[1500]; snprintf(p, sizeof p, "%s/save.json", root); FILE *f = fopen(p, "rb"); if (!f) return JS_NULL; fseek(f, 0, SEEK_END); long L = ftell(f); fseek(f, 0, SEEK_SET); char *b = malloc(L + 1); fread(b, 1, L, f); b[L] = 0; fclose(f); JSValue v = JS_NewString(c, b); free(b); return v; }
static JSValue j_save(JSContext *c, JSValueConst t, int n, JSValueConst *a); /* 後で定義(別スレッドで書く) */


/* ---- 音(SDL_mixer): 効果音・声は短い音をキャッシュ、BGMはストリーム ---- */
typedef struct { char key[200]; Mix_Chunk *ch; double len; } Snd;
#define NSND 1200
static Snd snds[NSND]; static int nsnd = 0; static Mix_Music *bgm = NULL; static int audio_ok = 0; static double mvol = 1.0; static volatile int g_vvol = 128; static volatile float g_vtgt = 1.0f, g_vcur = 1.0f, g_vstep = 0.0f; /* BGMの音量: 目標と今の値(なめらかに変える。クリックノイズを出さない) */ /* 動画の音量(0〜128)。Mix_HookMusic の音には Mix_VolumeMusic が効かないので、自分でかける */
static Snd *getsnd(const char *path){
  for (int i = 0; i < nsnd; i++) if (!strcmp(snds[i].key, path)) return snds[i].ch ? &snds[i] : NULL;
  if (nsnd >= NSND) return NULL;
  char full[1400]; snprintf(full, sizeof full, "%s/%s", root, path);
  Snd *e = &snds[nsnd++]; strncpy(e->key, path, 199); e->ch = Mix_LoadWAV(full); e->len = 0;
  if (!e->ch) { fprintf(stderr, "snd? %s (%s)\n", full, Mix_GetError()); return NULL; }
  int fr, ch; Uint16 fm; Mix_QuerySpec(&fr, &fm, &ch); int bps = (fm & 0xFF) / 8; e->len = (double)e->ch->alen / (fr * ch * bps);
  return e;
}
/* 無音がつづくと、HDMIのテレビ・アンプが音の出口を眠らせて、つぎの音の出だしが切れる(最初の声の「トン」が欠ける)。 聞こえない大きさの雑音(±2/32768)を、いつも足して、眠らせない */
static unsigned dither_s = 12345u;
static void postmix_dither(void *u, Uint8 *stream, int len){ Sint16 *p = (Sint16 *)stream; int n = len / 2; unsigned s = dither_s; for (int i = 0; i < n; i++) { s = s * 1664525u + 1013904223u; int v = p[i] + (int)((s >> 29) & 3) - 1; if (v > 32767) v = 32767; if (v < -32768) v = -32768; p[i] = (Sint16)v; } dither_s = s; }
static JSValue j_play(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  if (!audio_ok) return JS_NewFloat64(c, 0);
  const char *p = JS_ToCString(c, a[0]); double v = 1.0; if (n > 1) JS_ToFloat64(c, &v, a[1]);
  Snd *e = getsnd(p); JS_FreeCString(c, p); if (!e) return JS_NewFloat64(c, 0);
  int chn = Mix_PlayChannel(-1, e->ch, 0); if (chn >= 0) Mix_Volume(chn, (int)(v * 128)); return JS_NewFloat64(c, e->len); }
static JSValue j_len(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (!audio_ok) return JS_NewFloat64(c, 0); const char *p = JS_ToCString(c, a[0]); Snd *e = getsnd(p); JS_FreeCString(c, p); return JS_NewFloat64(c, e ? e->len : 0); }
static JSValue j_stopall(JSContext *c, JSValueConst t, int n, JSValueConst *a){ if (audio_ok) Mix_HaltChannel(-1); return JS_UNDEFINED; }
static int bgms_open(const char *path, int loop); static void bgms_close(void); static int bgms_active(void); static int bgms_failed(void); static int bgms_underruns(void); static int bgms_ms(void); /* video.h にある、BGM先読み再生 */
static int bgm_want = 0, bgm_loop = 1, bgm_restarts = 0; static double bgm_load_max = 0; static char bgm_path[1400];
static void bgm_log(const char *what, double ms, const char *path); /* あとで定義 */
static JSValue j_music(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  if (!audio_ok) return JS_UNDEFINED;
  const char *p = JS_ToCString(c, a[0]); int loop = n > 1 ? JS_ToBool(c, a[1]) : 1;
  if (bgm) { Mix_HaltMusic(); Mix_FreeMusic(bgm); bgm = NULL; } bgms_close(); bgm_want = 0;
  if (p && *p) { char full[1400]; snprintf(full, sizeof full, "%s/%s", root, p); double t0 = nowms();
    if (!getenv("MJ_BGM_OLD") && bgms_open(full, loop)) { double lt = nowms() - t0; if (lt > bgm_load_max) bgm_load_max = lt; if (lt >= 80) bgm_log("bgm-open", lt, p); bgm_want = 2; bgm_loop = loop; snprintf(bgm_path, sizeof bgm_path, "%s", p); JS_FreeCString(c, p); return JS_UNDEFINED; } /* 先読み再生(ふだんは、こちら) */ bgm = Mix_LoadMUS(full); double lt = nowms() - t0; if (lt > bgm_load_max) bgm_load_max = lt; if (lt >= 80) bgm_log("bgm-load", lt, p);
    if (!bgm) fprintf(stderr, "bgm? %s (%s)\n", full, Mix_GetError()); else { Mix_PlayMusic(bgm, loop ? -1 : 1); bgm_want = 1; bgm_loop = loop; snprintf(bgm_path, sizeof bgm_path, "%s", p); } }
  JS_FreeCString(c, p); return JS_UNDEFINED; }
static JSValue j_musicinfo(JSContext *c, JSValueConst t, int n, JSValueConst *a){ JSValue arr = JS_NewArray(c); JS_SetPropertyUint32(c, arr, 0, JS_NewInt32(c, audio_ok && bgm_want ? (bgm_want == 2 ? (bgms_active() ? 1 : 0) : (Mix_PlayingMusic() ? 1 : 0)) : -1)); JS_SetPropertyUint32(c, arr, 1, JS_NewInt32(c, bgm_restarts)); JS_SetPropertyUint32(c, arr, 2, JS_NewInt32(c, (int)bgm_load_max)); JS_SetPropertyUint32(c, arr, 3, JS_NewInt32(c, bgm_want == 2 ? bgms_underruns() : 0)); JS_SetPropertyUint32(c, arr, 4, JS_NewInt32(c, bgm_want == 2 ? bgms_ms() : -1)); return arr; }
static JSValue j_mvol(JSContext *c, JSValueConst t, int n, JSValueConst *a){ double v = 1; JS_ToFloat64(c, &v, a[0]); if (v < 0) v = 0; if (v > 1) v = 1; g_vvol = (int)(v * 128); { double ms = n > 1 ? ({ double q = 0; JS_ToFloat64(c, &q, a[1]); q; }) : 0; g_vtgt = (float)v; if (ms > 5) { g_vstep = (float)(fabs(v - g_vcur) / (44.1 * ms)); if (g_vstep <= 0) g_vstep = 1.0f; } else { g_vcur = (float)v; g_vstep = 0; } } if (audio_ok) Mix_VolumeMusic((int)(v * 128)); return JS_UNDEFINED; }
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
  SDL_SetRenderDrawColor(ren, 20, 50, 38, 255); SDL_Rect bar = { (W - 360) / 2, 296, 360, 20 }; SDL_RenderFillRect(ren, &bar);
  SDL_SetRenderDrawColor(ren, 222, 184, 96, 255); SDL_Rect fg = { (W - 360) / 2, 296, total ? 360 * done / total : 0, 20 }; SDL_RenderFillRect(ren, &fg);
  SDL_RenderPresent(ren); }
static void preload(void){
  static char *list[1200]; int n = 0;
  n = listdir("img", ".webp", list, 1200, n); n = listdir("img/tiles", ".webp", list, 1200, n); n = listdir("img/dice", ".webp", list, 1200, n); n = listdir("img/map", ".webp", list, 1200, n); n = listdir("img/certface", ".webp", list, 1200, n); n = listdir("img/t44", ".webp", list, 1200, n); n = listdir("img/t26", ".webp", list, 1200, n); n = listdir("img/chars", ".webp", list, 1200, n); n = listdir("img/chars/face", ".webp", list, 1200, n);
  n = listdir("img/you", ".webp", list, 1200, n); n = listdir("img/sil", ".webp", list, 1200, n); n = listdir("img/peek", ".webp", list, 1200, n); n = listdir("img/teacher", ".webp", list, 1200, n); n = listdir("img/video", ".webp", list, 1200, n); n = listdir("audio/yk", ".mp3", list, 1200, n); n = listdir("audio/voice", ".mp3", list, 1200, n); /* 声(読み上げ・掛け声)は、はじめて鳴らすときの読みこみで 出だしが切れるので、先に全部読む */ /* ビデオ一覧のサムネイル(はじめて見るとき、読みこみでカーソルが遅れないように) */
  { const char *st = getenv("MJ_STYLE"); if (st && !strcmp(st, "old")) n = listdir("img/zunda", ".webp", list, 1200, n); else { n = listdir("img/uk", ".webp", list, 1200, n); n = listdir("img/uk/chars/face", ".webp", list, 1200, n); n = listdir("img/uk/zunda", ".webp", list, 1200, n); } } /* 浮世絵版(ふだん) / MJ_STYLE=old で、前のバージョンの絵 */
  int nimgs = n; n = listdir("audio/sfx", ".wav", list, 1200, n);
  qsort(list, n, sizeof(char *), cmpstr);
  double t0 = nowms(); int last = -1;
  for (int i = 0; i < n; i++) {
    if ((strstr(list[i], "/certface/") && !strstr(list[i], "/certface/01.webp")) || strstr(list[i], "/tenbo_")) continue; /* 認定証の紙・ハンコ・顔(01)は先に読む(はじめて出すとき、画面が止まって ハンコのアニメが切れるため) */ /* 実機では使わない絵は、読まない(起動を速く) */
    size_t L = strlen(list[i]); if (L > 4 && (!strcmp(list[i] + L - 4, ".wav") || !strcmp(list[i] + L - 4, ".mp3"))) { if (audio_ok) (void)getsnd(list[i]); } else getimg(list[i], NULL, NULL);
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
typedef struct { char p[1500], q[1520]; char *s; } SaveJob;
static SDL_Thread *save_th = NULL;
static int save_run(void *u) { /* セーブは、別スレッドで書く(SDカードの書き込みを待たせて、画面を止めない) */
  SaveJob *j = (SaveJob *)u; FILE *f = fopen(j->q, "wb"); int ok = 0;
  if (f && j->s) { size_t L = strlen(j->s); ok = fwrite(j->s, 1, L, f) == L; fflush(f); fclose(f); if (ok) rename(j->q, j->p); } /* fsync は しない: SDカードで 数秒 止まり、そのあいだ ほかのファイル操作(画像・音の読み込み)まで 待たされるため。上書きの rename は、ext4 が データを先に書いてくれる */
  free(j->s); free(j); return 0; }
static void save_wait(void) { if (save_th) { double w0 = nowms(); SDL_WaitThread(save_th, NULL); save_th = NULL; double w = nowms() - w0; if (w > 80) bgm_log("save-wait", w, "slot"); } }
static SDL_Thread *save2_th = NULL; /* 設定などの保存(save.json): これも別スレッド。SDカードを待たせて、画面を止めない */
static int save2_run(void *u) { SaveJob *j = (SaveJob *)u; FILE *f = fopen(j->q, "wb"); if (f && j->s) { size_t L = strlen(j->s); int ok = fwrite(j->s, 1, L, f) == L; fclose(f); if (ok) rename(j->q, j->p); } free(j->s); free(j); return 0; }
static void save2_wait(void) { if (save2_th) { SDL_WaitThread(save2_th, NULL); save2_th = NULL; } }
static JSValue j_save(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  SaveJob *j = (SaveJob *)calloc(1, sizeof *j); if (!j) return JS_UNDEFINED;
  snprintf(j->p, sizeof j->p, "%s/save.json", root); snprintf(j->q, sizeof j->q, "%s.tmp", j->p);
  const char *s = JS_ToCString(c, a[0]); if (!s) { free(j); return JS_UNDEFINED; } j->s = strdup(s); JS_FreeCString(c, s);
  save2_wait(); save2_th = SDL_CreateThread(save2_run, "save2", j); if (!save2_th) save2_run(j);
  return JS_UNDEFINED; }
static JSValue j_slotsave(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  SaveJob *j = (SaveJob *)calloc(1, sizeof *j); if (!j) return JS_NewBool(c, 0);
  snprintf(j->p, sizeof j->p, "%s/save_%d.json", datadir, ai(c, a[0])); snprintf(j->q, sizeof j->q, "%s.tmp", j->p);
  const char *s = JS_ToCString(c, a[1]); if (!s) { free(j); return JS_NewBool(c, 0); } j->s = strdup(s); JS_FreeCString(c, s);
  save_wait(); save_th = SDL_CreateThread(save_run, "save", j); if (!save_th) { save_run(j); }
  return JS_NewBool(c, 1); }
static JSValue j_slotdel(JSContext *c, JSValueConst t, int n, JSValueConst *a){ char p[1500]; snprintf(p, sizeof p, "%s/save_%d.json", datadir, ai(c, a[0])); remove(p); return JS_UNDEFINED; }
static JSValue j_shanten(JSContext *c, JSValueConst t, int n, JSValueConst *a){ int cc[34]; for (int i = 0; i < 34; i++) { JSValue v = JS_GetPropertyUint32(c, a[0], i); int32_t x = 0; JS_ToInt32(c, &x, v); JS_FreeValue(c, v); cc[i] = x; } return JS_NewInt32(c, sh_std(cc, ai(c, a[1]))); }
static void dump_err(JSContext *c){ JSValue e = JS_GetException(c); const char *m = JS_ToCString(c, e); JSValue st = JS_GetPropertyStr(c, e, "stack"); const char *ss = JS_ToCString(c, st); fprintf(stderr, "JS ERR: %s\n%s\n", m ? m : "?", ss ? ss : ""); }
static void jobs(void){ JSContext *c1; int r; do { r = JS_ExecutePendingJob(rt, &c1); if (r < 0) dump_err(c1); } while (r > 0); }
static void rejected(JSContext *c, JSValueConst p, JSValueConst reason, JS_BOOL handled, void *o){ if (handled) return; const char *m = JS_ToCString(c, reason); JSValue st = JS_GetPropertyStr(c, reason, "stack"); const char *ss = JS_ToCString(c, st); fprintf(stderr, "UNHANDLED: %s\n%s\n", m ? m : "?", ss ? ss : ""); }
static int evalfile(const char *p){ size_t n; char *s = readfile(p, &n); if (!s) { fprintf(stderr, "cannot read %s\n", p); return 1; }
  JSValue v = JS_Eval(ctx, s, n, p, JS_EVAL_TYPE_GLOBAL); free(s); if (JS_IsException(v)) { dump_err(ctx); return 2; } JS_FreeValue(ctx, v); jobs(); return 0; }
static double key_block_until = 0; /* 起動のあいだ(進捗バー)に押されたボタンを、タイトルが出たとたんに受けつけない */
static void callkey(const char *k){ if (nowms() < key_block_until) return; JSValue g = JS_GetGlobalObject(ctx); JSValue f = JS_GetPropertyStr(ctx, g, "__key"); JSValue a = JS_NewString(ctx, k); JSValue r = JS_Call(ctx, f, g, 1, &a); if (JS_IsException(r)) dump_err(ctx); JS_FreeValue(ctx, r); JS_FreeValue(ctx, a); JS_FreeValue(ctx, f); JS_FreeValue(ctx, g); jobs(); }
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

static double stall_ms = 150; /* これより長く止まった(JSの処理・絵を描く)ときは、~/mjdata/stall.log に、何をしていたかを書く(MJ_STALL=ミリ秒で変更。0で書かない) */
static void stall_log(const char *kind, double ms){
  if (stall_ms <= 0 || ms < stall_ms) return; char cx[400] = "?";
  JSValue g = JS_GetGlobalObject(ctx), f = JS_GetPropertyStr(ctx, g, "__ctx"); if (JS_IsFunction(ctx, f)) { JSValue r = JS_Call(ctx, f, g, 0, NULL); const char *s = JS_ToCString(ctx, r); if (s) { snprintf(cx, sizeof cx, "%s", s); JS_FreeCString(ctx, s); } JS_FreeValue(ctx, r); } JS_FreeValue(ctx, f); JS_FreeValue(ctx, g);
  fprintf(stderr, "stall: %s %.0fms %s\n", kind, ms, cx);
  char p[1500]; snprintf(p, sizeof p, "%s/stall.log", datadir); FILE *fp = fopen(p, "a"); if (fp) { time_t t = time(NULL); struct tm *tm = localtime(&t); fprintf(fp, "%02d:%02d:%02d %s %.0fms %s\n", tm->tm_hour, tm->tm_min, tm->tm_sec, kind, ms, cx); fclose(fp); }
}
static void bgm_log(const char *what, double ms, const char *path){ /* BGMの異変を ~/mjdata/stall.log に書く */
  char p[1500]; snprintf(p, sizeof p, "%s/stall.log", datadir); FILE *fp = fopen(p, "a"); if (fp) { time_t t = time(NULL); struct tm *tm = localtime(&t); fprintf(fp, "%02d:%02d:%02d %s %.0fms %s\n", tm->tm_hour, tm->tm_min, tm->tm_sec, what, ms, path ? path : ""); fclose(fp); }
  fprintf(stderr, "%s %.0fms %s\n", what, ms, path ? path : ""); }
extern const char *crash_dir;
static void crash_h(int sig){ /* 落ちたとき、原因を ~/mjdata/crash.log に書く */
  char p[1500]; snprintf(p, sizeof p, "%s/crash.log", crash_dir ? crash_dir : "/tmp");
  int fd = open(p, O_WRONLY | O_CREAT | O_APPEND, 0644); if (fd >= 0) { char m[64]; int n = snprintf(m, sizeof m, "signal %d\n", sig); (void)!write(fd, m, n); void *bt[40]; int c = backtrace(bt, 40); backtrace_symbols_fd(bt, c, fd); close(fd); }
  signal(sig, SIG_DFL); raise(sig); }
const char *crash_dir = NULL;
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
  { const char *sv = getenv("MJ_STALL"); if (sv) stall_ms = atof(sv); }
  const char *fp = getenv("MJ_FONT"); if (!fp) fp = findfont(); if (!fp) { fprintf(stderr, "日本語フォントがありません: sudo apt install fonts-ipafont-gothic\n"); return 1; }
  strncpy(fontpath, fp, sizeof fontpath - 1);
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_JOYSTICK | SDL_INIT_EVENTS) < 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
  IMG_Init(IMG_INIT_WEBP | IMG_INIT_PNG); TTF_Init();
  if (!getenv("MJ_NOSOUND")) { if (SDL_InitSubSystem(SDL_INIT_AUDIO) == 0 && Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, getenv("MJ_ABUF") ? atoi(getenv("MJ_ABUF")) : 4096) == 0) { int mf = Mix_Init(MIX_INIT_MP3); Mix_AllocateChannels(16); audio_ok = 1; int fr, nc; Uint16 fm; Mix_QuerySpec(&fr, &fm, &nc); if (fm == AUDIO_S16SYS && !getenv("MJ_NODITHER")) Mix_SetPostMix(postmix_dither, NULL); printf("audio: ok (driver=%s, %dHz, ch=%d, mp3=%s)\n", SDL_GetCurrentAudioDriver() ? SDL_GetCurrentAudioDriver() : "?", fr, nc, (mf & MIX_INIT_MP3) ? "ok" : "NG"); } else fprintf(stderr, "audio? %s\n", SDL_GetError()); }
  { /* ゲーム本体(JS・絵)の優先度を、少し下げる: 重い処理で止まっても、BGMの音(別スレッド)が、先に動けるように。 MJ_NICE=0 で、やめる */
    int nv = getenv("MJ_NICE") ? atoi(getenv("MJ_NICE")) : 6; if (nv > 0) setpriority(PRIO_PROCESS, (id_t)syscall(SYS_gettid), nv); }
  int windowed = getenv("MJ_WINDOWED") != NULL, ww = 1080, wh = 642; if (windowed && sscanf(getenv("MJ_WINDOWED"), "%dx%d", &ww, &wh) != 2) { ww = 1080; wh = 642; } /* MJ_WINDOWED=832x468 など、窓の大きさも指定できる */
  win = SDL_CreateWindow("シンプル操作 AI本格麻雀", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, windowed ? ww : 0, windowed ? wh : 0, windowed ? SDL_WINDOW_RESIZABLE : SDL_WINDOW_FULLSCREEN_DESKTOP);
  if (!win) { fprintf(stderr, "window: %s\n", SDL_GetError()); return 1; }
  ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_TARGETTEXTURE);
  if (!ren) ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_SOFTWARE);
  if (!ren) { fprintf(stderr, "renderer: %s\n", SDL_GetError()); return 1; }
  SDL_RenderSetLogicalSize(ren, W, H); SDL_ShowCursor(SDL_DISABLE);
  SDL_RendererInfo ri; SDL_GetRendererInfo(ren, &ri); printf("renderer: %s\n", ri.name);
  for (int i = 0; i < SDL_NumJoysticks(); i++) { SDL_JoystickOpen(i); }
  initdata(); crash_dir = datadir; signal(SIGSEGV, crash_h); signal(SIGABRT, crash_h); signal(SIGBUS, crash_h); signal(SIGILL, crash_h); signal(SIGFPE, crash_h); preload();
  rt = JS_NewRuntime(); JS_SetMemoryLimit(rt, 192 * 1024 * 1024); JS_SetMaxStackSize(rt, 2 * 1024 * 1024); JS_SetHostPromiseRejectionTracker(rt, rejected, NULL);
  ctx = JS_NewContext(rt); JSValue g = JS_GetGlobalObject(ctx);
  JSValue gfx = JS_NewObject(ctx);
  reg(gfx, "dry", j_dry, 1); reg(gfx, "rrect", j_rrect, 9); reg(gfx, "fill", j_fill, 8); reg(gfx, "frame", j_frame, 8); reg(gfx, "image", j_image, 6); reg(gfx, "imageTop", j_imagetop, 5); reg(gfx, "fillTop", j_filltop, 8); reg(gfx, "imageRotTop", j_imagerottop, 7); reg(gfx, "textTop", j_texttop, 8); reg(gfx, "imageSil", j_imagesil, 6); reg(gfx, "text", j_text, 8); reg(gfx, "imageRot", j_imagerot, 7); reg(gfx, "textRot", j_textrot, 8); reg(gfx, "measure", j_measure, 2);
  reg(gfx, "clear", j_clear, 3); reg(gfx, "present", j_present, 0); reg(gfx, "view", j_view, 2); reg(gfx, "clip", j_clip, 4); reg(gfx, "layerBegin", j_layerbegin, 1); reg(gfx, "layerEnd", j_layerend, 0); reg(gfx, "layer", j_layer, 1); reg(gfx, "shot", j_shot, 1); JS_SetPropertyStr(ctx, gfx, "bold", JS_TRUE); /* 太字(字の大きさをマイナスで指定)に対応している、という印。古い本体(再ビルド前)では、JSが太字を使わないようにする */ reg(gfx, "snap", j_snap, 1);
  JS_SetPropertyStr(ctx, g, "gfx", gfx);
  JSValue snd = JS_NewObject(ctx); reg(snd, "play", j_play, 2); reg(snd, "len", j_len, 1); reg(snd, "stopAll", j_stopall, 0); reg(snd, "music", j_music, 2); reg(snd, "musicVol", j_mvol, 1); reg(snd, "musicInfo", j_musicinfo, 0);
  JS_SetPropertyStr(ctx, g, "snd", snd); reg(g, "__readtext", j_readtext, 1); reg(g, "__readdir", j_readdir, 1); reg(g, "__vopen", j_vopen, 2); reg(g, "__vstate", j_vstate, 0); reg(g, "__vseek", j_vseek, 1); reg(g, "__vpause", j_vpause, 1); reg(g, "__vclose", j_vclose, 0); JS_SetPropertyStr(ctx, g, "__dataDir", JS_NewString(ctx, datadir));
  { /* 動画の置き場所: ~/mjdata/video、SDカードのbootの mjdata(Windowsからも見えるところ)。それぞれ、直下も探す */
    static const char *bases[] = { "/boot/firmware/mjdata", "/boot/mjdata", NULL }; JSValue arr = JS_NewArray(ctx); int k = 0; char b[1400];
    snprintf(b, sizeof b, "%s/video", datadir); JS_SetPropertyUint32(ctx, arr, k++, JS_NewString(ctx, b)); JS_SetPropertyUint32(ctx, arr, k++, JS_NewString(ctx, datadir));
    snprintf(b, sizeof b, "%s/video", root); JS_SetPropertyUint32(ctx, arr, k++, JS_NewString(ctx, b)); /* git で取得する動画(リポジトリの mahjong/video)。 同じ名前が mjdata/video にあれば、そちらを先に使う */
    for (int i = 0; bases[i]; i++) { snprintf(b, sizeof b, "%s/video", bases[i]); JS_SetPropertyUint32(ctx, arr, k++, JS_NewString(ctx, b)); JS_SetPropertyUint32(ctx, arr, k++, JS_NewString(ctx, bases[i])); }
    JS_SetPropertyStr(ctx, g, "__videoDirs", arr); }
  reg(g, "print", j_print, 1); reg(g, "__now", j_now, 0); reg(g, "__quit", j_quit, 0); reg(g, "__load", j_load, 0); reg(g, "__save", j_save, 1); reg(g, "__swapab", j_swapab, 1); reg(g, "__shanten", j_shanten, 2); reg(g, "__slotlist", j_slotlist, 0); reg(g, "__slotload", j_slotload, 1); reg(g, "__slotsave", j_slotsave, 2); reg(g, "__slotdel", j_slotdel, 1);
  { if (getenv("MJ_FPS")) JS_SetPropertyStr(ctx, g, "__perfEnv", JS_NewBool(ctx, 1)); }
  { const char *tp = getenv("MJ_TEACHER"); if (tp) JS_SetPropertyStr(ctx, g, "__teacherEnv", JS_NewString(ctx, tp)); }
  { const char *cp = getenv("MJ_CPU"); if (cp) JS_SetPropertyStr(ctx, g, "__cpuEnv", JS_NewString(ctx, cp)); }
  { const char *sy = getenv("MJ_STYLE"); if (sy) JS_SetPropertyStr(ctx, g, "__styleEnv", JS_NewString(ctx, sy)); } /* MJ_STYLE=old で、前のバージョン(浮世絵版の前)の絵に戻す */
  { const char *cl = getenv("MJ_CALL"); if (cl) JS_SetPropertyStr(ctx, g, "__callEnv", JS_NewString(ctx, cl)); } /* MJ_CALL=old で、ポン・チー・ロンの宣言を、前の見た目に戻す */
  { const char *lo = getenv("MJ_LEARN"); if (lo) JS_SetPropertyStr(ctx, g, "__learnEnv", JS_NewString(ctx, lo)); } /* MJ_LEARN=old で、点数計算の勉強を、前の(タブの)見た目に戻す */
  { const char *yo = getenv("MJ_YOU"); if (yo) JS_SetPropertyStr(ctx, g, "__youEnv", JS_NewString(ctx, yo)); } /* MJ_YOU=old で、前の「あなた」の絵に戻す */
  JS_SetPropertyStr(ctx, g, "__auto", JS_NewBool(ctx, auto_)); if (shots) JS_SetPropertyStr(ctx, g, "__shotDir", JS_NewString(ctx, shots));
  const char *list[] = { "native/app/prelude.js", "js/tiles.js", "js/rules.js", "js/forms.js", "js/chars.js", "js/ai.js", "js/coach.js", "js/game.js", "js/banter.js", "js/banter2.js", "js/banter3.js", "js/banter4.js", "js/banter5.js", "js/chars2.js", "js/rank.js", "native/app/icon.js", "js/ruby.js", "js/drill.js", "native/app/stats.js", "native/app/learn.js", "native/app/dictdata.js", "native/app/dicepat.js", "native/app/map2data.js", "native/app/nsnd.js", "native/app/nui.js", NULL };
  for (int i = 0; list[i]; i++) { char p[1500]; snprintf(p, sizeof p, "%s/%s", root, list[i]); if (evalfile(p)) return 3; }
  { const char *sc = getenv("MJ_SCRIPT"); if (sc) { char p[1500]; snprintf(p, sizeof p, "%s", sc); evalfile(p); } } /* 試験用: 追加のJSを読む */
  SDL_PumpEvents(); SDL_FlushEvents(SDL_FIRSTEVENT, SDL_LASTEVENT); held = 0; axisdir[0] = axisdir[1] = 0; for (int i = 0; i < 32; i++) jb[i] = 0; key_block_until = nowms() + 450; /* 起動中に押されたボタンは、なかったことに */
  SDL_SetHint(SDL_HINT_RENDER_SCALE_QUALITY, "1");
  tgt = SDL_CreateTexture(ren, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_TARGET, W, H);
  if (!tgt) { fprintf(stderr, "target: %s\n", SDL_GetError()); return 1; }
  if (vplay) { /* 動画だけの動作テスト(窓は出るが、ゲームは動かさない) */
    if (!vid_open(vplay, 0)) { printf("open NG\n"); return 1; }
    double t0 = nowms(); int shown = 0, seeked = 0; extern void vid_dbg(double);
    while (nowms() - t0 < 8000) { SDL_Event ee; while (SDL_PollEvent(&ee)); static int it = 0; it++; if (vid_update()) shown++; SDL_Delay(2);
      if (!seeked && nowms() - t0 > 4000) { seeked = 1; j_vseek(ctx, JS_UNDEFINED, 1, (JSValue[]){ JS_NewFloat64(ctx, 120) }); printf("seek -> 120\n"); }
      if (((int)(nowms() - t0)) % 1000 < 3) { JSValue st = j_vstate(ctx, JS_UNDEFINED, 0, NULL); JSValue p = JS_GetPropertyUint32(ctx, st, 0); double pos; JS_ToFloat64(ctx, &pos, p); printf("t=%.1f pos=%.2f shown=%d drop=%d under=%d\n", (nowms() - t0) / 1000, pos, shown, V.dropped, V.under); SDL_Delay(5); } }
    vid_close(); return 0; }
  int frames = 0, shotn = 0, keep = 0; double perf_t0 = nowms(), perf_draw = 0, perf_pres = 0, perf_logic = 0, perf_logicmax = 0; int perf_n = 0, perf_p = 0; int perf = getenv("MJ_PERF") != NULL;
  JSValue gg = JS_GetGlobalObject(ctx);
  while (!quitf) {
    static double it0 = 0, it_ms = 0; { double tn0 = nowms(); if (it0) it_ms = it_ms * 0.7 + (tn0 - it0) * 0.3; it0 = tn0; } /* 1周にかかった時間(長押しの速さを、描く速さに合わせる) */
    SDL_Event e; int got = SDL_WaitEventTimeout(&e, (keep || vid_active()) ? 1 : 8);
    while (got) { handle_event(&e); got = SDL_PollEvent(&e); }
    { int both = (jb[8] && jb[9]) || (jb[6] && jb[7]); if (both) { if (!menu_t0) menu_t0 = nowms(); else if (menu_t0 > 0 && nowms() - menu_t0 > 1200) { callkey("menu"); menu_t0 = -1; } } else menu_t0 = 0; } /* スタート+セレクトを長押し: メニュー(終了など) */
    if (held && nowms() >= held_next) { callkey(HELD[held]); held_next = nowms() + (it_ms * 1.1 > 95 ? (it_ms * 1.1 > 220 ? 220 : it_ms * 1.1) : 95); }
    if (vid_update() && keep < 1) keep = 1; /* 動画の新しい絵が来たら、画面に出す */
    double tl0 = nowms(); int need = callframe(); { double d = nowms() - tl0; perf_logic += d; if (d > perf_logicmax) perf_logicmax = d; stall_log("logic", d); }
    if (need) {
      double t0 = nowms(); SDL_SetRenderTarget(ren, tgt); ntop = 0;
      JSValue f = JS_GetPropertyStr(ctx, gg, "__draw"); JSValue r = JS_Call(ctx, f, gg, 0, NULL); if (JS_IsException(r)) dump_err(ctx); JS_FreeValue(ctx, r); JS_FreeValue(ctx, f); jobs();
      if (shots && frames % 10 == 0 && shotn < 40) { char p[1600]; snprintf(p, sizeof p, "%s/s%02d.bmp", shots, shotn++); SDL_Surface *su = SDL_CreateRGBSurfaceWithFormat(0, W, H, 32, SDL_PIXELFORMAT_ARGB8888); SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, su->pixels, su->pitch); SDL_SaveBMP(su, p); SDL_FreeSurface(su); }
      SDL_SetRenderTarget(ren, NULL); keep = 3; perf_draw += nowms() - t0; perf_n++; stall_log("draw", nowms() - t0);
    }
    if (keep > 0) { double t0 = nowms(); SDL_RenderClear(ren); SDL_RenderCopy(ren, tgt, NULL, NULL); vid_render(); for (int i = 0; i < ntop; i++) { if (topq[i].kind == 1) { SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); SDL_SetRenderDrawColor(ren, topq[i].r, topq[i].g, topq[i].b, topq[i].a); SDL_RenderFillRect(ren, &topq[i].d); } else if (topq[i].kind == 0) { SDL_SetTextureAlphaMod(topq[i].tx, topq[i].a); SDL_RenderCopyEx(ren, topq[i].tx, &topq[i].sr, &topq[i].d, topq[i].ang, NULL, SDL_FLIP_NONE); SDL_SetTextureAlphaMod(topq[i].tx, 255); } else { SDL_SetTextureAlphaMod(topq[i].tx, 255); SDL_RenderCopy(ren, topq[i].tx, &topq[i].sr, &topq[i].d); } } { static double st0 = 0; static int dn[16]; if (!st0) st0 = nowms(); const char *sp = getenv("MJ_SNAP"), *sl = getenv("MJ_SNAPS"); if (sp && sl) { char b[256]; strncpy(b, sl, 255); b[255] = 0; int ti = 0; for (char *t = strtok(b, ","); t && ti < 16; t = strtok(NULL, ","), ti++) if (!dn[ti] && nowms() - st0 >= atoi(t)) { dn[ti] = 1; char fn[1600]; snprintf(fn, sizeof fn, "%s_%s.bmp", sp, t); int ow, oh; SDL_GetRendererOutputSize(ren, &ow, &oh); SDL_Surface *su = SDL_CreateRGBSurfaceWithFormat(0, ow, oh, 32, SDL_PIXELFORMAT_ARGB8888); SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, su->pixels, su->pitch); SDL_SaveBMP(su, fn); SDL_FreeSurface(su); } } } if (snappath[0]) { int ow, oh; SDL_GetRendererOutputSize(ren, &ow, &oh); SDL_Surface *su = SDL_CreateRGBSurfaceWithFormat(0, ow, oh, 32, SDL_PIXELFORMAT_ARGB8888); SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, su->pixels, su->pitch); SDL_SaveBMP(su, snappath); SDL_FreeSurface(su); snappath[0] = 0; } SDL_RenderPresent(ren); keep--; perf_pres += nowms() - t0; perf_p++; }
    { static double bgm_chk = 0; double tn = nowms(); if (tn - bgm_chk > 500) { bgm_chk = tn; /* BGMが、止めていないのに止まっていたら、もう一度鳴らして記録する(原因を調べるため) */
        if (audio_ok && bgm_want == 2 && bgms_failed()) { bgm_log("bgm-stream-fail", 0, bgm_path); bgms_close(); { char fp[1500]; snprintf(fp, sizeof fp, "%s/%s", root, bgm_path); bgm = Mix_LoadMUS(fp); if (bgm) { Mix_PlayMusic(bgm, bgm_loop ? -1 : 1); bgm_want = 1; } else bgm_want = 0; } } /* 先読み再生で開けなかったときは、ふつうの再生にもどる */
        if (audio_ok && bgm_want == 1 && bgm && !Mix_PlayingMusic()) { bgm_restarts++; bgm_log("bgm-stopped", 0, bgm_path); Mix_PlayMusic(bgm, bgm_loop ? -1 : 1); } } }
    frames++; if (maxframes && frames >= maxframes) break;
    if (perf && nowms() - perf_t0 > 3000) { printf("fonts=%d\n", nfonts); printf("perf: 描く %.1fms(%d回) / 画面に出す %.1fms(%d回)\n", perf_n ? perf_draw / perf_n : 0, perf_n, perf_p ? perf_pres / perf_p : 0, perf_p); { long rss = 0; FILE *sf = fopen("/proc/self/statm", "r"); if (sf) { long a; if (fscanf(sf, "%ld %ld", &a, &rss) < 2) rss = 0; fclose(sf); } JSMemoryUsage mu; JS_ComputeMemoryUsage(rt, &mu); printf("perf2: 思考・進行 合計%.0fms 最大%.0fms / JS %ldMB / 全体 %ldMB / 絵%d 文字%d\n", perf_logic, perf_logicmax, (long)(mu.malloc_size / 1048576), rss * 4 / 1024, nimg, ntxt); } fflush(stdout); perf_t0 = nowms(); perf_draw = perf_pres = perf_logic = perf_logicmax = 0; perf_n = perf_p = 0; }
  }
  save_wait(); save2_wait(); /* 書きかけのセーブがあれば、終わるのを待つ */
  return 0;
}
