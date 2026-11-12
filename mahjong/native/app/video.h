/* ゲーム内ビデオ再生(FFmpeg)。 main.c から #include される。
   作り: 読み込みスレッドが「絵(YUV)」と「音(PCM)」を作って待ち行列に入れ、
   メインの流れが、音の進み具合(音の時計)に合わせて絵を出す。音は Mix_HookMusic で流す。
   ※ ビルドに FFmpeg が無いときは -DNO_VIDEO で、動画なしでビルドされる(build.sh が自動で判断) */
#ifdef NO_VIDEO
static int bgms_open(const char *p, int loop) { return 0; }
static void bgms_close(void) {}
static int bgms_active(void) { return 0; }
static int bgms_underruns(void) { return 0; }
static int bgms_ms(void) { return -1; }
static int vid_update(void) { return 0; }
static void vid_render(void) {}
static void vid_close(void) {}
static int vid_active(void) { return 0; }
static JSValue j_vopen(JSContext *c, JSValueConst t, int n, JSValueConst *a) { return JS_NULL; }
static JSValue j_vstate(JSContext *c, JSValueConst t, int n, JSValueConst *a) { return JS_NULL; }
static JSValue j_vseek(JSContext *c, JSValueConst t, int n, JSValueConst *a) { return JS_UNDEFINED; }
static JSValue j_vpause(JSContext *c, JSValueConst t, int n, JSValueConst *a) { return JS_UNDEFINED; }
static JSValue j_vclose(JSContext *c, JSValueConst t, int n, JSValueConst *a) { return JS_UNDEFINED; }
static int vid_test(const char *p) { fprintf(stderr, "この版は動画なしでビルドされています(FFmpegが見つかりませんでした)\n"); return 1; }
#else
typedef struct { Uint8 *d[3]; int ls[3]; double pts; } VF;
typedef struct { AVPacket **p; int cap, r, w, n; } PQ; /* 読み込んだ(まだ解読していない)パケットの待ち行列 */
static struct {
  int open, paused, eof, stop, seekreq, showfirst, hasaudio, hasframe, slow, dropped;
  double seekto, discard, base, dur, wall0, wallpos;
  Uint64 consumed; double hookt, hooklen, pauseclk, avoff;
  AVFormatContext *fc; AVCodecContext *vc, *ac; int vs, as; AVRational vtb, atb; double vstart, astart;
  SwrContext *swr; int sw_rate, sw_fmt, sw_ch; struct SwsContext *sws;
  int w, h, nq, qr, qw, qn; VF *q; Uint8 *qmem;
  Sint16 *ab; int acap, ar, aw, an, rate; Sint16 *tmp; int tmpcap;
  SDL_mutex *mu; SDL_Thread *th, *thv, *tha; SDL_Texture *tex;
  PQ vpq, apq; volatile int gen; int abuf_fill, under;
} V;
/* 解読は、映像と音を別々のスレッドでやる(映像が間に合わなくても、音は、とぎれさせない) */
static void pq_flush(PQ *q) { while (q->n > 0) { av_packet_free(&q->p[q->r]); q->r = (q->r + 1) % q->cap; q->n--; } q->r = q->w = 0; }
static int pq_push(PQ *q, AVPacket *pk) { for (;;) { SDL_LockMutex(V.mu); if (q->n < q->cap) { q->p[q->w] = pk; q->w = (q->w + 1) % q->cap; q->n++; SDL_UnlockMutex(V.mu); return 1; } SDL_UnlockMutex(V.mu); if (V.stop || V.seekreq) return 0; SDL_Delay(2); } }
static AVPacket *pq_pop(PQ *q, int *g) { SDL_LockMutex(V.mu); AVPacket *pk = NULL; if (q->n > 0) { pk = q->p[q->r]; q->r = (q->r + 1) % q->cap; q->n--; } *g = V.gen; SDL_UnlockMutex(V.mu); return pk; }

static double vclock_l(void) { /* 今の再生位置(秒)。ロック中に呼ぶ */
  if (V.paused) return V.pauseclk;
  if (V.hasaudio) { /* 音は、まとめて(約0.1秒ぶん)受け取られるので、そのあいだは経過時間で補う */
    double el = V.hookt > 0 ? (nowms() - V.hookt) / 1000.0 : 0; if (el > V.hooklen * 1.5) el = V.hooklen * 1.5;
    return V.base + (double)V.consumed / V.rate - V.hooklen + el + V.avoff; }
  return V.base + (V.paused ? V.wallpos : V.wallpos + (nowms() - V.wall0) / 1000.0);
}
static void vhook(void *u, Uint8 *st, int len) { /* 音を出す側(別スレッド) */
  memset(st, 0, len);
  if (!V.open || V.paused || V.seekreq) return;
  SDL_LockMutex(V.mu);
  if (V.abuf_fill) { if (V.an >= V.rate / 4 || (V.eof && V.apq.n == 0)) V.abuf_fill = 0; else { SDL_UnlockMutex(V.mu); return; } } /* 音が足りなくなったら、少したまるまで 待つ(細かい音切れを、さける) */
  int need = len / 4, n = need < V.an ? need : V.an, first = V.acap - V.ar < n ? V.acap - V.ar : n;
  memcpy(st, V.ab + V.ar * 2, first * 4); if (n > first) memcpy(st + first * 4, V.ab, (n - first) * 4);
  if (g_vvol < 128) { int vv = g_vvol; Sint16 *sp = (Sint16 *)st; for (int i = 0; i < n * 2; i++) sp[i] = (Sint16)((sp[i] * vv) >> 7); } /* 音量 */
  V.ar = (V.ar + n) % V.acap; V.an -= n; V.consumed += n; if (n > 0) { V.hookt = nowms(); V.hooklen = (double)need / V.rate; } if (n < need && !V.eof) { V.abuf_fill = 1; V.under++; }
  SDL_UnlockMutex(V.mu);
}
static double vts(int64_t ts, AVRational tb, double start) { return ts == AV_NOPTS_VALUE ? -1 : ts * av_q2d(tb) - start; }

static void vpush_video(AVFrame *fr, int mygen) {
  double pts = vts(fr->best_effort_timestamp, V.vtb, V.vstart); if (pts < 0) pts = 0;
  if (pts < V.discard - 0.001) return; /* シークした先より前の絵は捨てる */
  while (!V.stop && V.gen == mygen) { SDL_LockMutex(V.mu); int full = V.qn >= V.nq; SDL_UnlockMutex(V.mu); if (!full) break; SDL_Delay(3); }
  if (V.stop || V.gen != mygen) return;
  VF *f = &V.q[V.qw];
  if (fr->format == AV_PIX_FMT_YUV420P || fr->format == AV_PIX_FMT_YUVJ420P) {
    for (int p = 0; p < 3; p++) { int hh = p ? (V.h + 1) / 2 : V.h; for (int y = 0; y < hh; y++) memcpy(f->d[p] + y * f->ls[p], fr->data[p] + y * fr->linesize[p], f->ls[p]); }
  } else {
    V.sws = sws_getCachedContext(V.sws, fr->width, fr->height, fr->format, V.w, V.h, AV_PIX_FMT_YUV420P, SWS_FAST_BILINEAR, NULL, NULL, NULL);
    if (!V.sws) return; sws_scale(V.sws, (const uint8_t *const *)fr->data, fr->linesize, 0, fr->height, f->d, f->ls);
  }
  f->pts = pts; SDL_LockMutex(V.mu); if (V.gen == mygen) { V.qw = (V.qw + 1) % V.nq; V.qn++; } SDL_UnlockMutex(V.mu);
}
static int vswr_make(AVFrame *fr) {
#if LIBAVCODEC_VERSION_INT >= AV_VERSION_INT(59, 24, 100)
  int ch = fr->ch_layout.nb_channels; AVChannelLayout out = AV_CHANNEL_LAYOUT_STEREO;
  if (V.swr && V.sw_rate == fr->sample_rate && V.sw_fmt == fr->format && V.sw_ch == ch) return 1;
  swr_free(&V.swr); V.swr = NULL;
  AVChannelLayout in; if (fr->ch_layout.order == AV_CHANNEL_ORDER_UNSPEC) av_channel_layout_default(&in, ch); else av_channel_layout_copy(&in, &fr->ch_layout);
  if (swr_alloc_set_opts2(&V.swr, &out, AV_SAMPLE_FMT_S16, V.rate, &in, fr->format, fr->sample_rate, 0, NULL) < 0) return 0;
#else
  int ch = fr->channels; if (V.swr && V.sw_rate == fr->sample_rate && V.sw_fmt == fr->format && V.sw_ch == ch) return 1;
  swr_free(&V.swr); V.swr = NULL;
  int64_t in = fr->channel_layout ? fr->channel_layout : av_get_default_channel_layout(ch);
  V.swr = swr_alloc_set_opts(NULL, AV_CH_LAYOUT_STEREO, AV_SAMPLE_FMT_S16, V.rate, in, fr->format, fr->sample_rate, 0, NULL); if (!V.swr) return 0;
#endif
  if (swr_init(V.swr) < 0) { swr_free(&V.swr); V.swr = NULL; return 0; }
  V.sw_rate = fr->sample_rate; V.sw_fmt = fr->format; V.sw_ch = ch; return 1;
}
static void vpush_audio(AVFrame *fr, int mygen) {
  double pts = vts(fr->best_effort_timestamp, V.atb, V.astart);
  if (!vswr_make(fr)) return;
  int cap = swr_get_out_samples(V.swr, fr->nb_samples) + 64;
  if (cap > V.tmpcap) { free(V.tmp); V.tmp = malloc((size_t)cap * 4); V.tmpcap = cap; }
  uint8_t *o[1] = { (uint8_t *)V.tmp };
  int got = swr_convert(V.swr, o, cap, (const uint8_t **)fr->extended_data, fr->nb_samples); if (got <= 0) return;
  int skip = 0;
  if (pts >= 0 && V.discard > 0) { double end = pts + (double)got / V.rate; if (end <= V.discard) return; if (pts < V.discard) skip = (int)((V.discard - pts) * V.rate); if (skip >= got) return; }
  int off = skip;
  while (off < got && !V.stop && V.gen == mygen) {
    SDL_LockMutex(V.mu); int space = V.acap - V.an, m = got - off < space ? got - off : space; if (V.gen != mygen) { SDL_UnlockMutex(V.mu); break; }
    if (m > 0) { int first = V.acap - V.aw < m ? V.acap - V.aw : m; memcpy(V.ab + V.aw * 2, V.tmp + off * 2, first * 4); if (m > first) memcpy(V.ab, V.tmp + (off + first) * 2, (m - first) * 4); V.aw = (V.aw + m) % V.acap; V.an += m; }
    SDL_UnlockMutex(V.mu); off += m > 0 ? m : 0; if (m <= 0) SDL_Delay(5);
  }
}
static int vthread(void *u) { /* 読み込み(パケットを、映像用・音用の待ち行列に分ける)。シークも、ここ */
  AVPacket *pk = av_packet_alloc();
  while (!V.stop) {
    if (V.seekreq) {
      SDL_LockMutex(V.mu); double t = V.seekto; V.seekreq = 0; SDL_UnlockMutex(V.mu);
      int64_t ts = (int64_t)(t * AV_TIME_BASE);
      if (av_seek_frame(V.fc, -1, ts, AVSEEK_FLAG_BACKWARD) < 0) av_seek_frame(V.fc, -1, ts, AVSEEK_FLAG_ANY);
      SDL_LockMutex(V.mu); pq_flush(&V.vpq); pq_flush(&V.apq); V.gen++; V.qr = V.qw = V.qn = 0; V.ar = V.aw = V.an = 0; V.consumed = 0; V.hookt = 0; V.base = t; V.wallpos = 0; V.wall0 = nowms(); V.discard = t; V.eof = 0; V.showfirst = 1; V.abuf_fill = 1; SDL_UnlockMutex(V.mu);
      if (V.seekreq) continue;
    }
    if (V.eof) { SDL_Delay(10); continue; }
    int r = av_read_frame(V.fc, pk);
    if (r < 0) { V.eof = 1; continue; }
    AVPacket *c = av_packet_alloc(); av_packet_move_ref(c, pk); int ok = 0;
    if (c->stream_index == V.vs) ok = pq_push(&V.vpq, c); else if (c->stream_index == V.as && V.ac) ok = pq_push(&V.apq, c);
    if (!ok) av_packet_free(&c);
  }
  av_packet_free(&pk); return 0;
}
static int vdec_thread(void *u) { /* 映像の解読(優先度は低め。間に合わないときは、絵を捨てる) */
  AVFrame *fr = av_frame_alloc(); int mygen = V.gen; SDL_SetThreadPriority(SDL_THREAD_PRIORITY_LOW);
  while (!V.stop) {
    int pg; AVPacket *pk = pq_pop(&V.vpq, &pg); if (!pk) { SDL_Delay(2); continue; }
    if (pg != mygen) { avcodec_flush_buffers(V.vc); mygen = pg; }
    if (V.slow) V.vc->skip_loop_filter = AVDISCARD_ALL; /* 間に合わないときは、画質を少し落として速くする */
    if (V.slow >= 2) V.vc->skip_frame = AVDISCARD_NONREF;
    { static int slow_ms = -1; if (slow_ms < 0) slow_ms = getenv("MJ_VSLOW") ? atoi(getenv("MJ_VSLOW")) : 0; if (slow_ms) SDL_Delay(slow_ms); } /* 試験用: 映像の解読を、わざと遅くする */
    if (avcodec_send_packet(V.vc, pk) >= 0) while (!V.stop && V.gen == mygen && avcodec_receive_frame(V.vc, fr) >= 0) { vpush_video(fr, mygen); av_frame_unref(fr); }
    av_packet_free(&pk);
  }
  av_frame_free(&fr); return 0;
}
static int adec_thread(void *u) { /* 音の解読 */
  AVFrame *fr = av_frame_alloc(); int mygen = V.gen;
  while (!V.stop) {
    int pg; AVPacket *pk = pq_pop(&V.apq, &pg); if (!pk) { SDL_Delay(2); continue; }
    if (pg != mygen) { avcodec_flush_buffers(V.ac); swr_free(&V.swr); V.swr = NULL; mygen = pg; }
    if (avcodec_send_packet(V.ac, pk) >= 0) while (!V.stop && V.gen == mygen && avcodec_receive_frame(V.ac, fr) >= 0) { vpush_audio(fr, mygen); av_frame_unref(fr); }
    av_packet_free(&pk);
  }
  av_frame_free(&fr); return 0;
}
static void vid_close(void) {
  if (!V.open) return;
  V.open = 0; V.stop = 1; if (audio_ok) Mix_HookMusic(NULL, NULL);
  if (V.th) SDL_WaitThread(V.th, NULL); if (V.thv) SDL_WaitThread(V.thv, NULL); if (V.tha) SDL_WaitThread(V.tha, NULL);
  if (V.vpq.p) { pq_flush(&V.vpq); free(V.vpq.p); } if (V.apq.p) { pq_flush(&V.apq); free(V.apq.p); }
  if (V.tex) SDL_DestroyTexture(V.tex);
  if (V.vc) avcodec_free_context(&V.vc);
  if (V.ac) avcodec_free_context(&V.ac);
  if (V.fc) avformat_close_input(&V.fc);
  if (V.swr) swr_free(&V.swr);
  if (V.sws) sws_freeContext(V.sws);
  if (V.mu) SDL_DestroyMutex(V.mu);
  free(V.q); free(V.qmem); free(V.ab); free(V.tmp);
  memset(&V, 0, sizeof V);
}
static AVCodecContext *vopen_codec(AVStream *st, const char *envname) {
  const AVCodec *dec = NULL; const char *nm = envname ? getenv(envname) : NULL;
  if ((!nm || !*nm) && envname && st->codecpar->codec_id == AV_CODEC_ID_H264) nm = "h264_v4l2m2m"; /* ふだんは、まずハードウェア解読を試す(使えなければ、自動で、ふつうの解読に)。 MJ_VDEC=h264 で、ふつうの解読に固定 */
  if (nm && *nm) dec = avcodec_find_decoder_by_name(nm);
  for (int pass = 0; pass < 2; pass++) {
    if (!dec) dec = avcodec_find_decoder(st->codecpar->codec_id); if (!dec) return NULL;
    AVCodecContext *cx = avcodec_alloc_context3(dec); if (!cx) return NULL;
    avcodec_parameters_to_context(cx, st->codecpar);
    if (st->codecpar->codec_type == AVMEDIA_TYPE_VIDEO) { cx->thread_count = SDL_GetCPUCount() > 4 ? 4 : SDL_GetCPUCount(); cx->flags2 |= AV_CODEC_FLAG2_FAST; }
    if (avcodec_open2(cx, dec, NULL) >= 0) { fprintf(stderr, "video: %s decoder = %s\n", st->codecpar->codec_type == AVMEDIA_TYPE_VIDEO ? "映像" : "音", dec->name); return cx; }
    avcodec_free_context(&cx); dec = NULL; /* 指定のデコーダが使えなければ、ふつうのものに */
  }
  return NULL;
}
static int vid_open(const char *path, double start) {
  vid_close(); memset(&V, 0, sizeof V);
  if (avformat_open_input(&V.fc, path, NULL, NULL) < 0) { V.fc = NULL; fprintf(stderr, "video? 開けません: %s\n", path); return 0; }
  if (avformat_find_stream_info(V.fc, NULL) < 0) { avformat_close_input(&V.fc); return 0; }
  V.vs = av_find_best_stream(V.fc, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0); V.as = av_find_best_stream(V.fc, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0);
  if (V.vs < 0) { avformat_close_input(&V.fc); return 0; }
  AVStream *vs = V.fc->streams[V.vs]; V.vtb = vs->time_base; V.vstart = vs->start_time == AV_NOPTS_VALUE ? 0 : vs->start_time * av_q2d(vs->time_base);
  V.vc = vopen_codec(vs, "MJ_VDEC"); if (!V.vc) { avformat_close_input(&V.fc); return 0; }
  if (V.as >= 0 && audio_ok) { AVStream *as = V.fc->streams[V.as]; V.atb = as->time_base; V.astart = as->start_time == AV_NOPTS_VALUE ? 0 : as->start_time * av_q2d(as->time_base); V.ac = vopen_codec(as, NULL); }
  V.hasaudio = V.ac != NULL;
  V.w = V.vc->width > 0 ? V.vc->width : vs->codecpar->width; V.h = V.vc->height > 0 ? V.vc->height : vs->codecpar->height;
  if (V.w <= 0 || V.h <= 0) { V.open = 1; vid_close(); return 0; }
  V.dur = V.fc->duration > 0 ? (double)V.fc->duration / AV_TIME_BASE : 0;
  { Uint16 fm; int nc; Mix_QuerySpec(&V.rate, &fm, &nc); if (V.rate <= 0) V.rate = 44100; }
  V.acap = V.rate * 2; V.ab = malloc((size_t)V.acap * 4);
  size_t fsz = (size_t)V.w * V.h + 2 * (size_t)((V.w + 1) / 2) * ((V.h + 1) / 2); V.nq = (int)(40 * 1024 * 1024 / fsz); if (V.nq > 24) V.nq = 24; if (V.nq < 4) V.nq = 4;
  V.q = calloc(V.nq, sizeof(VF)); V.qmem = malloc(fsz * V.nq);
  for (int i = 0; i < V.nq; i++) { Uint8 *b = V.qmem + fsz * i; V.q[i].ls[0] = V.w; V.q[i].ls[1] = V.q[i].ls[2] = (V.w + 1) / 2; V.q[i].d[0] = b; V.q[i].d[1] = b + (size_t)V.w * V.h; V.q[i].d[2] = V.q[i].d[1] + (size_t)((V.w + 1) / 2) * ((V.h + 1) / 2); }
  V.tex = SDL_CreateTexture(ren, SDL_PIXELFORMAT_IYUV, SDL_TEXTUREACCESS_STREAMING, V.w, V.h);
  if (!V.tex) { fprintf(stderr, "video? texture: %s\n", SDL_GetError()); V.open = 1; vid_close(); return 0; }
  V.avoff = getenv("MJ_AVOFF") ? atof(getenv("MJ_AVOFF")) / 1000.0 : 0; V.hooklen = 0.09; V.mu = SDL_CreateMutex(); V.wall0 = nowms(); V.base = start > 0 ? start : 0; V.discard = V.base; V.showfirst = 1;
  if (start > 0.5) { V.seekto = start; V.seekreq = 1; }
  if (V.hasaudio) { Mix_HaltMusic(); Mix_VolumeMusic(128); Mix_HookMusic(vhook, NULL); }
  V.vpq.cap = 160; V.vpq.p = calloc(V.vpq.cap, sizeof(AVPacket *)); V.apq.cap = 600; V.apq.p = calloc(V.apq.cap, sizeof(AVPacket *)); V.abuf_fill = 1;
  V.open = 1; V.th = SDL_CreateThread(vthread, "vdemux", NULL); V.thv = SDL_CreateThread(vdec_thread, "vdec", NULL); if (V.hasaudio) V.tha = SDL_CreateThread(adec_thread, "adec", NULL);
  return 1;
}
static int vid_active(void) { return V.open; }
static int vid_update(void) { /* 出す絵があれば、テクスチャに入れる。入れたら 1 */
  if (!V.open || V.seekreq) return 0;
  SDL_LockMutex(V.mu); double clk = vclock_l(); int show = 0;
  if (V.qn > 0) {
    if (V.showfirst) { show = 1; V.showfirst = 0; }
    else if (!V.paused) { while (V.qn > 1 && V.q[(V.qr + 1) % V.nq].pts <= clk) { V.qr = (V.qr + 1) % V.nq; V.qn--; V.dropped++; } if (V.q[V.qr].pts <= clk + 0.003) show = 1; }
  }
  if (V.dropped > 8 && V.slow < 1) V.slow = 1; if (V.dropped > 80 && V.slow < 2) V.slow = 2;
  SDL_UnlockMutex(V.mu);
  if (!show) return 0;
  VF *f = &V.q[V.qr]; double tu0 = nowms(); SDL_UpdateYUVTexture(V.tex, NULL, f->d[0], f->ls[0], f->d[1], f->ls[1], f->d[2], f->ls[2]); V.hasframe = 1; if (getenv("MJ_VDBG")) fprintf(stderr, "upload %.1fms\n", nowms() - tu0);
  SDL_LockMutex(V.mu); V.qr = (V.qr + 1) % V.nq; V.qn--; SDL_UnlockMutex(V.mu); return 1;
}
static void vid_render(void) {
  if (!V.open || !V.hasframe) return;
  double s = (double)W / V.w; if ((double)H / V.h < s) s = (double)H / V.h;
  SDL_Rect d; d.w = (int)(V.w * s); d.h = (int)(V.h * s); d.x = (W - d.w) / 2; d.y = (H - d.h) / 2; SDL_RenderCopy(ren, V.tex, NULL, &d);
}
static JSValue j_vopen(JSContext *c, JSValueConst t, int n, JSValueConst *a) { /* 開く: (絶対パス, 始める秒) → {w,h,dur} か null */
  const char *p = JS_ToCString(c, a[0]); double st = 0; if (n > 1) JS_ToFloat64(c, &st, a[1]);
  int ok = p ? vid_open(p, st) : 0; JS_FreeCString(c, p); if (!ok) return JS_NULL;
  JSValue o = JS_NewObject(c); JS_SetPropertyStr(c, o, "w", JS_NewInt32(c, V.w)); JS_SetPropertyStr(c, o, "h", JS_NewInt32(c, V.h)); JS_SetPropertyStr(c, o, "dur", JS_NewFloat64(c, V.dur)); return o;
}
static JSValue j_vstate(JSContext *c, JSValueConst t, int n, JSValueConst *a) { /* [位置秒, 長さ秒, 一時停止, 終わった, 絵が出ている] */
  if (!V.open) return JS_NULL;
  SDL_LockMutex(V.mu); double pos = vclock_l(); int ended = V.eof && !V.seekreq && V.vpq.n == 0 && V.apq.n == 0 && (V.hasaudio ? V.an == 0 : V.qn == 0); SDL_UnlockMutex(V.mu);
  if (pos < 0) pos = 0; if (V.dur > 0 && pos > V.dur) pos = V.dur;
  JSValue r = JS_NewArray(c); JS_SetPropertyUint32(c, r, 0, JS_NewFloat64(c, pos)); JS_SetPropertyUint32(c, r, 1, JS_NewFloat64(c, V.dur)); JS_SetPropertyUint32(c, r, 2, JS_NewInt32(c, V.paused)); JS_SetPropertyUint32(c, r, 3, JS_NewInt32(c, ended)); JS_SetPropertyUint32(c, r, 4, JS_NewInt32(c, V.hasframe)); return r;
}
static JSValue j_vseek(JSContext *c, JSValueConst t, int n, JSValueConst *a) { /* その秒へ移る */
  if (!V.open) return JS_UNDEFINED; double s = 0; JS_ToFloat64(c, &s, a[0]); if (V.dur > 2 && s > V.dur - 1) s = V.dur - 1; if (s < 0) s = 0;
  SDL_LockMutex(V.mu); V.seekto = s; V.seekreq = 1; V.base = s; V.consumed = 0; V.wallpos = 0; V.wall0 = nowms(); V.hookt = 0; V.qn = 0; V.qr = V.qw; V.an = 0; V.ar = V.aw; SDL_UnlockMutex(V.mu); return JS_UNDEFINED;
}
static JSValue j_vpause(JSContext *c, JSValueConst t, int n, JSValueConst *a) {
  if (!V.open) return JS_UNDEFINED; int p = JS_ToBool(c, a[0]); SDL_LockMutex(V.mu); if (p && !V.paused) V.pauseclk = vclock_l();
  if (!p && V.paused) V.hookt = 0; /* 再開 */
  if (p && !V.paused) V.wallpos += (nowms() - V.wall0) / 1000.0; if (!p && V.paused) V.wall0 = nowms(); V.paused = p; SDL_UnlockMutex(V.mu); return JS_UNDEFINED;
}
static JSValue j_vclose(JSContext *c, JSValueConst t, int n, JSValueConst *a) { vid_close(); return JS_UNDEFINED; }
/* 動画が、この機械で、実時間で回るかを測る: ./mj <mahjong> --vtest 動画.mp4 (画面なしでもOK) */
static int vid_test(const char *path) {
  AVFormatContext *fc = NULL; if (avformat_open_input(&fc, path, NULL, NULL) < 0 || avformat_find_stream_info(fc, NULL) < 0) { fprintf(stderr, "開けません: %s\n", path); return 1; }
  int vs = av_find_best_stream(fc, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0); if (vs < 0) return 1;
  AVCodecContext *vc = vopen_codec(fc->streams[vs], "MJ_VDEC"); if (!vc) return 1;
  AVPacket *pk = av_packet_alloc(); AVFrame *fr = av_frame_alloc(); int nfr = 0; double t0 = nowms(), vid_t = 0;
  while (av_read_frame(fc, pk) >= 0 && nowms() - t0 < 10000) {
    if (pk->stream_index == vs && avcodec_send_packet(vc, pk) >= 0) while (avcodec_receive_frame(vc, fr) >= 0) { nfr++; vid_t = fr->best_effort_timestamp * av_q2d(fc->streams[vs]->time_base); av_frame_unref(fr); }
    av_packet_unref(pk);
  }
  double el = (nowms() - t0) / 1000.0;
  printf("映像 %dx%d: %d枚を%.1f秒でデコード(動画%.1f秒ぶん)→ 実時間の %.2f 倍 %s\n", vc->width, vc->height, nfr, el, vid_t, el > 0 ? vid_t / el : 0, (vid_t / (el > 0 ? el : 1)) >= 1.0 ? "(OK: 間に合います)" : "(間に合いません: コマ落ちします。MJ_VDEC=h264_v4l2m2m も試してください)");
  return 0;
}

/* ===== BGMの先読み再生 =====
   BGMを、FFmpegで解読して、5秒ぶんの「音の置き場(リング)」に、先にためておく。音を出す側は、そこから取り出すだけ。
   ほかの重い処理(絵・計算・SDカード)で、CPUが足りなくなっても、ためた分で もちこたえるので、音が途切れにくい。 */
static struct { AVFormatContext *fc; AVCodecContext *ac; SwrContext *swr; int si, rate, sw_rate, sw_fmt, sw_ch, loop, cap, rd, wr, n, underruns; Sint16 *buf, *tmp; int tmpcap; SDL_mutex *mu; SDL_Thread *th; volatile int stop, on; } B;
static int bgms_active(void) { return B.on; }
static int bgms_underruns(void) { return B.underruns; }
static int bgms_ms(void) { return B.rate ? (int)(B.n * 1000.0 / B.rate) : -1; }
static int bgms_swr(AVFrame *fr) {
#if LIBAVCODEC_VERSION_INT >= AV_VERSION_INT(59, 24, 100)
  int ch = fr->ch_layout.nb_channels; AVChannelLayout out = AV_CHANNEL_LAYOUT_STEREO;
  if (B.swr && B.sw_rate == fr->sample_rate && B.sw_fmt == fr->format && B.sw_ch == ch) return 1;
  swr_free(&B.swr); B.swr = NULL;
  AVChannelLayout in; if (fr->ch_layout.order == AV_CHANNEL_ORDER_UNSPEC) av_channel_layout_default(&in, ch); else av_channel_layout_copy(&in, &fr->ch_layout);
  if (swr_alloc_set_opts2(&B.swr, &out, AV_SAMPLE_FMT_S16, B.rate, &in, fr->format, fr->sample_rate, 0, NULL) < 0) return 0;
#else
  int ch = fr->channels; if (B.swr && B.sw_rate == fr->sample_rate && B.sw_fmt == fr->format && B.sw_ch == ch) return 1;
  swr_free(&B.swr); B.swr = NULL;
  int64_t in = fr->channel_layout ? fr->channel_layout : av_get_default_channel_layout(ch);
  B.swr = swr_alloc_set_opts(NULL, AV_CH_LAYOUT_STEREO, AV_SAMPLE_FMT_S16, B.rate, in, fr->format, fr->sample_rate, 0, NULL); if (!B.swr) return 0;
#endif
  if (swr_init(B.swr) < 0) { swr_free(&B.swr); B.swr = NULL; return 0; }
  B.sw_rate = fr->sample_rate; B.sw_fmt = fr->format; B.sw_ch = ch; return 1;
}
static void bgms_push(AVFrame *fr) {
  if (!bgms_swr(fr)) return;
  int cap = swr_get_out_samples(B.swr, fr->nb_samples) + 64; if (cap > B.tmpcap) { free(B.tmp); B.tmp = malloc((size_t)cap * 4); B.tmpcap = cap; }
  uint8_t *o[1] = { (uint8_t *)B.tmp }; int got = swr_convert(B.swr, o, cap, (const uint8_t **)fr->extended_data, fr->nb_samples); if (got <= 0) return;
  int off = 0;
  while (off < got && !B.stop) {
    SDL_LockMutex(B.mu); int space = B.cap - B.n, m = got - off < space ? got - off : space;
    if (m > 0) { int first = B.cap - B.wr < m ? B.cap - B.wr : m; memcpy(B.buf + B.wr * 2, B.tmp + off * 2, first * 4); if (m > first) memcpy(B.buf, B.tmp + (off + first) * 2, (m - first) * 4); B.wr = (B.wr + m) % B.cap; B.n += m; }
    SDL_UnlockMutex(B.mu); if (m > 0) off += m; else SDL_Delay(10);
  }
}
static int bgms_thread(void *u) {
  setpriority(PRIO_PROCESS, (id_t)syscall(SYS_gettid), 3); /* 絵を描く本体よりは、少し優先(音の準備は、先に済ませる) */
  AVPacket *pk = av_packet_alloc(); AVFrame *fr = av_frame_alloc();
  while (!B.stop) {
    SDL_LockMutex(B.mu); int space = B.cap - B.n; SDL_UnlockMutex(B.mu);
    if (space < 16384) { SDL_Delay(20); continue; } /* いっぱいに近いあいだは、待つ */
    int r = av_read_frame(B.fc, pk);
    if (r < 0) { if (B.loop) { av_seek_frame(B.fc, -1, 0, AVSEEK_FLAG_BACKWARD); avcodec_flush_buffers(B.ac); continue; } break; }
    if (pk->stream_index == B.si && avcodec_send_packet(B.ac, pk) >= 0) while (!B.stop && avcodec_receive_frame(B.ac, fr) >= 0) { bgms_push(fr); av_frame_unref(fr); }
    av_packet_unref(pk);
  }
  av_packet_free(&pk); av_frame_free(&fr); return 0;
}
static void bgms_hook(void *u, Uint8 *st, int len) { /* 音を出す側(別スレッド): 置き場から取り出すだけ */
  memset(st, 0, len); if (!B.on) return;
  SDL_LockMutex(B.mu); int need = len / 4, n = need < B.n ? need : B.n, first = B.cap - B.rd < n ? B.cap - B.rd : n;
  memcpy(st, B.buf + B.rd * 2, first * 4); if (n > first) memcpy(st + first * 4, B.buf, (n - first) * 4); B.rd = (B.rd + n) % B.cap; B.n -= n; if (n < need) B.underruns++;
  SDL_UnlockMutex(B.mu);
  if (g_vvol < 128) { Sint16 *sp = (Sint16 *)st; int vv = g_vvol; for (int i = 0; i < n * 2; i++) sp[i] = (Sint16)((sp[i] * vv) >> 7); }
}
static void bgms_close(void) {
  if (!B.on && !B.fc) return;
  B.stop = 1; if (audio_ok) Mix_HookMusic(NULL, NULL); B.on = 0;
  if (B.th) { SDL_WaitThread(B.th, NULL); B.th = NULL; }
  if (B.ac) avcodec_free_context(&B.ac); if (B.fc) avformat_close_input(&B.fc); if (B.swr) swr_free(&B.swr);
  if (B.mu) { SDL_DestroyMutex(B.mu); B.mu = NULL; } free(B.buf); free(B.tmp);
  memset(&B, 0, sizeof B);
}
static int bgms_open(const char *path, int loop) { /* 開けなかったら 0 を返す(そのときは、SDL_mixer の ふつうの再生に もどる) */
  bgms_close(); if (!audio_ok || vid_active()) return 0;
  if (avformat_open_input(&B.fc, path, NULL, NULL) < 0) { B.fc = NULL; return 0; }
  if (avformat_find_stream_info(B.fc, NULL) < 0) { bgms_close(); return 0; }
  B.si = av_find_best_stream(B.fc, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0); if (B.si < 0) { bgms_close(); return 0; }
  const AVCodec *dec = avcodec_find_decoder(B.fc->streams[B.si]->codecpar->codec_id); if (!dec) { bgms_close(); return 0; }
  B.ac = avcodec_alloc_context3(dec); avcodec_parameters_to_context(B.ac, B.fc->streams[B.si]->codecpar); if (avcodec_open2(B.ac, dec, NULL) < 0) { bgms_close(); return 0; }
  { Uint16 fm; int nc; Mix_QuerySpec(&B.rate, &fm, &nc); if (B.rate <= 0) B.rate = 44100; }
  B.loop = loop; B.cap = B.rate * 6; B.buf = malloc((size_t)B.cap * 4); B.mu = SDL_CreateMutex(); if (!B.buf || !B.mu) { bgms_close(); return 0; }
  Mix_HaltMusic(); B.stop = 0; B.th = SDL_CreateThread(bgms_thread, "bgm", NULL); if (!B.th) { bgms_close(); return 0; }
  { double t0 = nowms(); while (nowms() - t0 < 600) { SDL_LockMutex(B.mu); int n = B.n; SDL_UnlockMutex(B.mu); if (n >= B.rate) break; SDL_Delay(5); } } /* 最初に、1秒ぶんだけ ためてから、鳴らしはじめる */
  B.on = 1; Mix_HookMusic(bgms_hook, NULL); return 1;
}
#endif
/* ディレクトリの中の名前の一覧(並べ替え済み)。なければ null */
static int vcmp(const void *a, const void *b) { return strcmp(*(char *const *)a, *(char *const *)b); }
static JSValue j_readdir(JSContext *c, JSValueConst t, int n, JSValueConst *a) {
  const char *p = JS_ToCString(c, a[0]); DIR *dp = p ? opendir(p) : NULL; JS_FreeCString(c, p); if (!dp) return JS_NULL;
  char **nm = malloc(sizeof(char *) * 512); int m = 0; struct dirent *de;
  while ((de = readdir(dp)) && m < 512) if (de->d_name[0] != '.') nm[m++] = strdup(de->d_name);
  closedir(dp); qsort(nm, m, sizeof(char *), vcmp);
  JSValue r = JS_NewArray(c); for (int i = 0; i < m; i++) { JS_SetPropertyUint32(c, r, i, JS_NewString(c, nm[i])); free(nm[i]); } free(nm); return r;
}
