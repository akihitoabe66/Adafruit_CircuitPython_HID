/* 操作シンプル 本格麻雀 — Raspberry Pi 用ネイティブ版(試作)
   C → SDL2 → Linux。ゲームの頭脳は JavaScript(QuickJS)のまま使い回す。
   使い方: ./mj <ゲームのフォルダ(mahjong)> [--shots 出力フォルダ] [--auto] [--frames N] */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <SDL.h>
#include <SDL_image.h>
#include <SDL_ttf.h>
#include "quickjs.h"

static SDL_Window *win; static SDL_Renderer *ren; static JSContext *ctx; static JSRuntime *rt;
static char root[1024] = "."; static int quitf = 0; static TTF_Font *fonts[24]; static int fsz[24]; static int nfonts = 0;
static char fontpath[1024];
#define W 720
#define H 428
static double nowms(void){ struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec*1000.0+t.tv_nsec/1e6; }

/* ---- 画像・文字のキャッシュ ---- */
typedef struct { char key[200]; SDL_Texture *tex; int w, h; } Ent;
#define NIMG 400
#define NTXT 500
static Ent imgs[NIMG]; static int nimg = 0; static Ent txts[NTXT]; static int ntxt = 0;
static SDL_Texture *getimg(const char *path, int *w, int *h){
  for (int i = 0; i < nimg; i++) if (!strcmp(imgs[i].key, path)) { if (w) *w = imgs[i].w; if (h) *h = imgs[i].h; return imgs[i].tex; }
  if (nimg >= NIMG) return NULL;
  char full[1400]; snprintf(full, sizeof full, "%s/%s", root, path);
  SDL_Surface *s = IMG_Load(full); if (!s) { fprintf(stderr, "img? %s (%s)\n", full, IMG_GetError()); return NULL; }
  SDL_Texture *t = SDL_CreateTextureFromSurface(ren, s);
  Ent *e = &imgs[nimg++]; strncpy(e->key, path, 199); e->tex = t; e->w = s->w; e->h = s->h; SDL_FreeSurface(s);
  if (w) *w = e->w; if (h) *h = e->h; return t;
}
static TTF_Font *getfont(int sz){
  for (int i = 0; i < nfonts; i++) if (fsz[i] == sz) return fonts[i];
  if (nfonts >= 24) return fonts[0];
  TTF_Font *f = TTF_OpenFont(fontpath, sz); if (!f) { fprintf(stderr, "font? %s\n", TTF_GetError()); return NULL; }
  fonts[nfonts] = f; fsz[nfonts++] = sz; return f;
}
static SDL_Texture *gettext(const char *s, int sz, int r, int g, int b, int *w, int *h){
  char key[200]; snprintf(key, sizeof key, "%d|%d,%d,%d|%.150s", sz, r, g, b, s);
  for (int i = 0; i < ntxt; i++) if (!strcmp(txts[i].key, key)) { *w = txts[i].w; *h = txts[i].h; return txts[i].tex; }
  if (ntxt >= NTXT) { for (int i = 0; i < ntxt; i++) SDL_DestroyTexture(txts[i].tex); ntxt = 0; }
  TTF_Font *f = getfont(sz); if (!f) return NULL;
  SDL_Color c = { r, g, b, 255 }; SDL_Surface *su = TTF_RenderUTF8_Blended(f, s, c); if (!su) return NULL;
  SDL_Texture *t = SDL_CreateTextureFromSurface(ren, su);
  Ent *e = &txts[ntxt++]; strncpy(e->key, key, 199); e->tex = t; e->w = su->w; e->h = su->h; SDL_FreeSurface(su);
  *w = e->w; *h = e->h; return t;
}

/* ---- JS に渡す描画の道具 ---- */
static int ai(JSContext *c, JSValueConst v){ int32_t x = 0; JS_ToInt32(c, &x, v); return x; }
static JSValue j_fill(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND); SDL_SetRenderDrawColor(ren, ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), n > 7 ? ai(c,a[7]) : 255); SDL_Rect r = { ai(c,a[0]), ai(c,a[1]), ai(c,a[2]), ai(c,a[3]) }; SDL_RenderFillRect(ren, &r); return JS_UNDEFINED; }
static JSValue j_frame(JSContext *c, JSValueConst t, int n, JSValueConst *a){ SDL_SetRenderDrawColor(ren, ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), 255); int th = n > 7 ? ai(c,a[7]) : 1; for (int i = 0; i < th; i++) { SDL_Rect r = { ai(c,a[0])+i, ai(c,a[1])+i, ai(c,a[2])-2*i, ai(c,a[3])-2*i }; SDL_RenderDrawRect(ren, &r); } return JS_UNDEFINED; }
static JSValue j_image(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *p = JS_ToCString(c, a[0]); int w, h; SDL_Texture *tx = getimg(p, &w, &h); JS_FreeCString(c, p); if (!tx) return JS_FALSE;
  SDL_Rect d = { ai(c,a[1]), ai(c,a[2]), ai(c,a[3]), ai(c,a[4]) }; SDL_SetTextureAlphaMod(tx, n > 5 ? ai(c,a[5]) : 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_TRUE; }
static JSValue j_text(JSContext *c, JSValueConst t, int n, JSValueConst *a){
  const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; int al = n > 7 ? ai(c,a[7]) : 0;
  SDL_Texture *tx = (s && *s) ? gettext(s, ai(c,a[3]), ai(c,a[4]), ai(c,a[5]), ai(c,a[6]), &w, &h) : NULL; JS_FreeCString(c, s);
  if (!tx) return JS_NewInt32(c, 0);
  int x = ai(c,a[1]); if (al == 1) x -= w / 2; else if (al == 2) x -= w;
  SDL_Rect d = { x, ai(c,a[2]), w, h }; SDL_SetTextureAlphaMod(tx, 255); SDL_RenderCopy(ren, tx, NULL, &d); return JS_NewInt32(c, w); }
static JSValue j_measure(JSContext *c, JSValueConst t, int n, JSValueConst *a){ const char *s = JS_ToCString(c, a[0]); int w = 0, h = 0; TTF_Font *f = getfont(ai(c,a[1])); if (f && s) TTF_SizeUTF8(f, s, &w, &h); JS_FreeCString(c, s); return JS_NewInt32(c, w); }
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

static char *readfile(const char *p, size_t *n){ FILE *f = fopen(p, "rb"); if (!f) return NULL; fseek(f, 0, SEEK_END); long L = ftell(f); fseek(f, 0, SEEK_SET); char *b = malloc(L + 1); fread(b, 1, L, f); b[L] = 0; fclose(f); *n = L; return b; }
static void dump_err(JSContext *c){ JSValue e = JS_GetException(c); const char *m = JS_ToCString(c, e); JSValue st = JS_GetPropertyStr(c, e, "stack"); const char *ss = JS_ToCString(c, st); fprintf(stderr, "JS ERR: %s\n%s\n", m ? m : "?", ss ? ss : ""); }
static void jobs(void){ JSContext *c1; int r; do { r = JS_ExecutePendingJob(rt, &c1); if (r < 0) dump_err(c1); } while (r > 0); }
static void rejected(JSContext *c, JSValueConst p, JSValueConst reason, JS_BOOL handled, void *o){ if (handled) return; const char *m = JS_ToCString(c, reason); JSValue st = JS_GetPropertyStr(c, reason, "stack"); const char *ss = JS_ToCString(c, st); fprintf(stderr, "UNHANDLED: %s\n%s\n", m ? m : "?", ss ? ss : ""); }
static int evalfile(const char *p){ size_t n; char *s = readfile(p, &n); if (!s) { fprintf(stderr, "cannot read %s\n", p); return 1; }
  JSValue v = JS_Eval(ctx, s, n, p, JS_EVAL_TYPE_GLOBAL); free(s); if (JS_IsException(v)) { dump_err(ctx); return 2; } JS_FreeValue(ctx, v); jobs(); return 0; }
static void callkey(const char *k){ JSValue g = JS_GetGlobalObject(ctx); JSValue f = JS_GetPropertyStr(ctx, g, "__key"); JSValue a = JS_NewString(ctx, k); JSValue r = JS_Call(ctx, f, g, 1, &a); if (JS_IsException(r)) dump_err(ctx); JS_FreeValue(ctx, r); JS_FreeValue(ctx, a); JS_FreeValue(ctx, f); JS_FreeValue(ctx, g); jobs(); }
static int callframe(void){ JSValue g = JS_GetGlobalObject(ctx); JSValue f = JS_GetPropertyStr(ctx, g, "__frame"); JSValue a = JS_NewFloat64(ctx, nowms()); JSValue r = JS_Call(ctx, f, g, 1, &a); int d = 0; if (JS_IsException(r)) dump_err(ctx); else d = JS_ToBool(ctx, r); JS_FreeValue(ctx, r); JS_FreeValue(ctx, a); JS_FreeValue(ctx, f); JS_FreeValue(ctx, g); jobs(); return d; }

static void reg(JSValue o, const char *name, JSCFunction *f, int n){ JS_SetPropertyStr(ctx, o, name, JS_NewCFunction(ctx, f, name, n)); }
static const char *findfont(void){
  static const char *c[] = { "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/takao-gothic/TakaoGothic.ttf", NULL };
  for (int i = 0; c[i]; i++) { FILE *f = fopen(c[i], "rb"); if (f) { fclose(f); return c[i]; } } return NULL; }

static int axisdir[2] = { 0, 0 };
static void joyaxis(int axis, int v){ int d = v > 16000 ? 1 : v < -16000 ? -1 : 0; if (axis > 1) return; if (d != axisdir[axis]) { axisdir[axis] = d; if (d) callkey(axis == 0 ? (d > 0 ? "right" : "left") : (d > 0 ? "down" : "up")); } }

int main(int argc, char **argv){
  const char *shots = NULL; int auto_ = 0, maxframes = 0; char *files[64]; int nf = 0;
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--shots") && i + 1 < argc) shots = argv[++i];
    else if (!strcmp(argv[i], "--auto")) auto_ = 1;
    else if (!strcmp(argv[i], "--frames") && i + 1 < argc) maxframes = atoi(argv[++i]);
    else if (i == 1) strncpy(root, argv[i], sizeof root - 1);
  }
  const char *fp = getenv("MJ_FONT"); if (!fp) fp = findfont(); if (!fp) { fprintf(stderr, "日本語フォントがありません: sudo apt install fonts-ipafont-gothic\n"); return 1; }
  strncpy(fontpath, fp, sizeof fontpath - 1);
  if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_JOYSTICK | SDL_INIT_EVENTS) < 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
  IMG_Init(IMG_INIT_WEBP | IMG_INIT_PNG); TTF_Init();
  int windowed = getenv("MJ_WINDOWED") != NULL;
  win = SDL_CreateWindow("mahjong", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, windowed ? 1080 : 0, windowed ? 642 : 0, windowed ? SDL_WINDOW_RESIZABLE : SDL_WINDOW_FULLSCREEN_DESKTOP);
  if (!win) { fprintf(stderr, "window: %s\n", SDL_GetError()); return 1; }
  ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_TARGETTEXTURE);
  if (!ren) ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_SOFTWARE);
  if (!ren) { fprintf(stderr, "renderer: %s\n", SDL_GetError()); return 1; }
  SDL_RenderSetLogicalSize(ren, W, H); SDL_ShowCursor(SDL_DISABLE);
  SDL_RendererInfo ri; SDL_GetRendererInfo(ren, &ri); printf("renderer: %s\n", ri.name);
  for (int i = 0; i < SDL_NumJoysticks(); i++) { SDL_JoystickOpen(i); }
  rt = JS_NewRuntime(); JS_SetMemoryLimit(rt, 192 * 1024 * 1024); JS_SetMaxStackSize(rt, 2 * 1024 * 1024); JS_SetHostPromiseRejectionTracker(rt, rejected, NULL);
  ctx = JS_NewContext(rt); JSValue g = JS_GetGlobalObject(ctx);
  JSValue gfx = JS_NewObject(ctx);
  reg(gfx, "fill", j_fill, 8); reg(gfx, "frame", j_frame, 8); reg(gfx, "image", j_image, 6); reg(gfx, "text", j_text, 8); reg(gfx, "measure", j_measure, 2);
  reg(gfx, "clear", j_clear, 3); reg(gfx, "present", j_present, 0); reg(gfx, "shot", j_shot, 1);
  JS_SetPropertyStr(ctx, g, "gfx", gfx);
  reg(g, "print", j_print, 1); reg(g, "__now", j_now, 0); reg(g, "__quit", j_quit, 0); reg(g, "__load", j_load, 0); reg(g, "__save", j_save, 1);
  JS_SetPropertyStr(ctx, g, "__auto", JS_NewBool(ctx, auto_)); if (shots) JS_SetPropertyStr(ctx, g, "__shotDir", JS_NewString(ctx, shots));
  const char *list[] = { "native/app/prelude.js", "js/tiles.js", "js/rules.js", "js/forms.js", "js/chars.js", "js/ai.js", "js/game.js", "native/app/nui.js", NULL };
  for (int i = 0; list[i]; i++) { char p[1500]; snprintf(p, sizeof p, "%s/%s", root, list[i]); if (evalfile(p)) return 3; }
  int frames = 0, shotn = 0; double last = 0; Uint32 lastdraw = 0;
  while (!quitf) {
    SDL_Event e;
    while (SDL_PollEvent(&e)) {
      if (e.type == SDL_QUIT) quitf = 1;
      else if (e.type == SDL_JOYDEVICEADDED) SDL_JoystickOpen(e.jdevice.which);
      else if (e.type == SDL_KEYDOWN && !e.key.repeat) {
        switch (e.key.keysym.sym) {
          case SDLK_LEFT: callkey("left"); break; case SDLK_RIGHT: callkey("right"); break; case SDLK_UP: callkey("up"); break; case SDLK_DOWN: callkey("down"); break;
          case SDLK_RETURN: case SDLK_SPACE: case SDLK_z: callkey("ok"); break;
          case SDLK_ESCAPE: case SDLK_BACKSPACE: case SDLK_x: callkey("back"); break;
          case SDLK_q: if (e.key.keysym.mod & KMOD_CTRL) quitf = 1; break; }
      }
      else if (e.type == SDL_JOYHATMOTION) { if (e.jhat.value & SDL_HAT_LEFT) callkey("left"); else if (e.jhat.value & SDL_HAT_RIGHT) callkey("right"); else if (e.jhat.value & SDL_HAT_UP) callkey("up"); else if (e.jhat.value & SDL_HAT_DOWN) callkey("down"); }
      else if (e.type == SDL_JOYAXISMOTION) joyaxis(e.jaxis.axis, e.jaxis.value);
      else if (e.type == SDL_JOYBUTTONDOWN) callkey(e.jbutton.button == 1 || e.jbutton.button == 3 ? "back" : "ok");
    }
    int dirty = callframe();
    Uint32 t = SDL_GetTicks();
    if (dirty) { lastdraw = t; SDL_RenderPresent(ren); if (shots && frames % 20 == 0 && shotn < 40) { char p[1600]; snprintf(p, sizeof p, "%s/s%02d.bmp", shots, shotn++); JSValue sg = JS_GetPropertyStr(ctx, g, "gfx"); JS_FreeValue(ctx, sg); int ow, oh; SDL_GetRendererOutputSize(ren, &ow, &oh); SDL_Surface *su = SDL_CreateRGBSurfaceWithFormat(0, ow, oh, 32, SDL_PIXELFORMAT_ARGB8888); SDL_RenderReadPixels(ren, NULL, SDL_PIXELFORMAT_ARGB8888, su->pixels, su->pitch); SDL_SaveBMP(su, p); SDL_FreeSurface(su); } }
    frames++; if (maxframes && frames >= maxframes) break;
    double d = nowms() - last; (void)d; SDL_Delay(auto_ ? 4 : 16); last = nowms();
  }
  return 0;
}
