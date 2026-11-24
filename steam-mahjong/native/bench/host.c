#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "quickjs.h"
static double nowms(){ struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec*1000.0+t.tv_nsec/1e6; }
static JSValue js_print(JSContext*c, JSValueConst this_val, int argc, JSValueConst*argv){ for(int i=0;i<argc;i++){ const char*s=JS_ToCString(c,argv[i]); if(s){ printf("%s%s", i?" ":"", s); JS_FreeCString(c,s);} } printf("\n"); return JS_UNDEFINED; }
static JSValue js_now(JSContext*c, JSValueConst this_val, int argc, JSValueConst*argv){ return JS_NewFloat64(c, nowms()); }
static char* readfile(const char*p, size_t*n){ FILE*f=fopen(p,"rb"); if(!f) return NULL; fseek(f,0,SEEK_END); long L=ftell(f); fseek(f,0,SEEK_SET); char*b=malloc(L+1); fread(b,1,L,f); b[L]=0; fclose(f); *n=L; return b; }
int main(int argc,char**argv){
  JSRuntime*rt=JS_NewRuntime(); JS_SetMemoryLimit(rt, 256*1024*1024); JS_SetMaxStackSize(rt, 4*1024*1024);
  JSContext*c=JS_NewContext(rt);
  JSValue g=JS_GetGlobalObject(c);
  JS_SetPropertyStr(c,g,"print",JS_NewCFunction(c,js_print,"print",1));
  JS_SetPropertyStr(c,g,"__now",JS_NewCFunction(c,js_now,"__now",0));
  for(int i=1;i<argc;i++){ size_t n; char*s=readfile(argv[i],&n); if(!s){fprintf(stderr,"cannot read %s\n",argv[i]); return 1;}
    JSValue v=JS_Eval(c,s,n,argv[i],JS_EVAL_TYPE_GLOBAL);
    if(JS_IsException(v)){ JSValue e=JS_GetException(c); const char*m=JS_ToCString(c,e); fprintf(stderr,"ERR in %s: %s\n",argv[i],m); JSValue st=JS_GetPropertyStr(c,e,"stack"); const char*ss=JS_ToCString(c,st); if(ss) fprintf(stderr,"%s\n",ss); return 2; }
    JS_FreeValue(c,v); free(s); }
  { JSContext*c1; int r; do { r=JS_ExecutePendingJob(rt,&c1); if(r<0){ JSValue e=JS_GetException(c1); const char*m=JS_ToCString(c1,e); fprintf(stderr,"job err: %s\n",m); break; } } while(r>0); }
  return 0; }
