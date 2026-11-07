/* 通常形のシャンテン数を C で計算する(JS 版 rules.js の stdShanten と同じ答え)。
   色ごとに「面子数・ターツ数・雀頭」の組み合わせを数え、覚えておく(同じ形は2度計算しない)。 */
#ifndef SHANTEN_H
#define SHANTEN_H
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

static uint64_t *sh_tab_num = NULL, *sh_tab_hon = NULL;   /* 数牌: 5^9 通り / 字牌: 5^7 通り */

static void sh_rec(int *a, int n, int num, int i, int m, int t, int j, uint64_t *mask){
  while (i < n && a[i] == 0) i++;
  if (m > 4) return;
  if (i >= n) { *mask |= 1ULL << (m * 10 + (t > 4 ? 4 : t) * 2 + j); return; }
  if (a[i] >= 3) { a[i] -= 3; sh_rec(a, n, num, i, m + 1, t, j, mask); a[i] += 3; }
  if (num && i <= n - 3 && a[i + 1] > 0 && a[i + 2] > 0) { a[i]--; a[i + 1]--; a[i + 2]--; sh_rec(a, n, num, i, m + 1, t, j, mask); a[i]++; a[i + 1]++; a[i + 2]++; }
  if (a[i] >= 2) {
    if (!j) { a[i] -= 2; sh_rec(a, n, num, i, m, t, 1, mask); a[i] += 2; }
    a[i] -= 2; sh_rec(a, n, num, i, m, t + 1, j, mask); a[i] += 2;
  }
  if (num && i <= n - 2 && a[i + 1] > 0) { a[i]--; a[i + 1]--; sh_rec(a, n, num, i, m, t + 1, j, mask); a[i]++; a[i + 1]++; }
  if (num && i <= n - 3 && a[i + 2] > 0) { a[i]--; a[i + 2]--; sh_rec(a, n, num, i, m, t + 1, j, mask); a[i]++; a[i + 2]++; }
  a[i]--; sh_rec(a, n, num, i, m, t, j, mask); a[i]++;
}
static uint64_t sh_suit(const int *c, int off, int n, int num){
  int a[9]; unsigned key = 0;
  for (int i = 0; i < n; i++) { int v = c[off + i]; if (v > 4) v = 4; a[i] = v; key = key * 5 + v; }
  uint64_t **tab = num ? &sh_tab_num : &sh_tab_hon;
  if (!*tab) *tab = (uint64_t *)calloc(num ? 1953125 : 78125, sizeof(uint64_t));
  uint64_t r = (*tab)[key];
  if (r) return r;
  sh_rec(a, n, num, 0, 0, 0, 0, &r);
  (*tab)[key] = r; return r;
}
/* c: 34個の枚数, f: 副露の数 */
static int sh_std(const int *c, int f){
  unsigned char cur[50], nx[50]; memset(cur, 0, 50); cur[(f > 4 ? 4 : f) * 10] = 1;
  static const int OFF[4] = { 0, 9, 18, 27 }, N[4] = { 9, 9, 9, 7 };
  for (int p = 0; p < 4; p++) {
    uint64_t cs = sh_suit(c, OFF[p], N[p], p < 3);
    memset(nx, 0, 50);
    for (int s = 0; s < 50; s++) {
      if (!cur[s]) continue;
      int m0 = s / 10, t0 = (s % 10) >> 1, j0 = s & 1;
      for (int q = 0; q < 50; q++) {
        if (!((cs >> q) & 1)) continue;
        int j1 = q & 1, m1 = q / 10, t1 = (q % 10) >> 1;
        if (j0 && j1) continue;
        int m = m0 + m1; if (m > 4) continue;
        int t = t0 + t1; if (t > 4) t = 4;
        nx[m * 10 + t * 2 + (j0 | j1)] = 1;
      }
    }
    memcpy(cur, nx, 50);
  }
  int best = 8;
  for (int s = 0; s < 50; s++) {
    if (!cur[s]) continue;
    int m = s / 10, t = (s % 10) >> 1, j = s & 1, tt = t < 4 - m ? t : 4 - m;
    int sh = 8 - 2 * m - tt - j; if (sh < best) best = sh;
  }
  return best;
}
#endif
