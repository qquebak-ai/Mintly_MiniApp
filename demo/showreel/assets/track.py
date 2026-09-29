# Авторский трек под шоурил: 120 BPM, такт = 2с, смена сцены каждые 4с.
import numpy as np, wave
from scipy.signal import butter, lfilter
SR=44100; DUR=24.0; n=int(SR*DUR); L=np.zeros(n); R=np.zeros(n)
rs=np.random.RandomState(7)
def put(t,s,g=1.0,pan=0.0):
    i=int(t*SR); e=min(n,i+len(s)); s=s[:e-i]*g
    L[i:e]+=s*(1-pan)*0.5*2**.5*0.71; R[i:e]+=s*(1+pan)*0.5*2**.5*0.71
def tt(d): return np.arange(int(d*SR))/SR
def lp(x,f): b,a=butter(2,f/(SR/2)); return lfilter(b,a,x)
def hp(x,f): b,a=butter(2,f/(SR/2),'high'); return lfilter(b,a,x)
def bp(x,f1,f2): b,a=butter(2,[f1/(SR/2),f2/(SR/2)],'band'); return lfilter(b,a,x)
def env(t,a,d): return np.minimum(1,t/a)*np.exp(-t/d)
def kick():
    t=tt(.4); f=160*np.exp(-t*28)+44; return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*7)
def clap():
    t=tt(.25); x=bp(rs.randn(len(t)),900,4000); return x*np.exp(-t*18)*.9
def hat(d=.05):
    t=tt(d); return hp(rs.randn(len(t)),7000)*np.exp(-t*80)*.5
def saw(f,t): return 2*((f*t)%1)-1
def pad(freqs,d,cut):
    t=tt(d); x=sum(saw(f*(1+dt),t) for f in freqs for dt in (-.004,0,.005))
    x=lp(x,cut)/ (len(freqs)*3); return x*np.minimum(1,t/.35)*np.minimum(1,(d-t)/.4+.001).clip(0,1)
def bass(f,d):
    t=tt(d); x=np.sin(2*np.pi*f*t)+.35*np.tanh(3*np.sin(2*np.pi*f*t)); return x*env(t,.005,d*.7)
def whoosh(d=.6):
    t=tt(d); x=bp(rs.randn(len(t)),600,6000); return x*(t/d)**3
def boom():
    t=tt(1.6); f=70*np.exp(-t*4)+32; return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*2.2) + lp(rs.randn(len(t)),1500)*np.exp(-t*9)*.4
# аккорды: Am F C G по такту
CH=[[220,261.6,329.6],[174.6,220,261.6],[196,261.6,329.6],[196,246.9,293.7]]
BS=[55,43.65,65.41,49]
for bar in range(12):
    t0=bar*2; c=CH[bar%4]
    cut=600 if t0<4 else (1800 if t0<16 else 3000)
    put(t0,pad(c,2.05,cut),.55 if t0>=4 else .4)
# интро: тикающий пульс и подъём
for b in range(8): put(b*.5,hat(.03),.5)
put(3.4,whoosh(.6),.7)
# основной бит 4–22
for i in range(int((22-4)/.5)):
    tm=4+i*.5; put(tm,kick(),1.0)
    if i%2==1: put(tm,clap(),.45)
    put(tm+.25,hat(),.45,.3)
    if tm>=16: put(tm+.125,hat(.03),.3,-.3); put(tm+.375,hat(.03),.3,-.3)
    put(tm,bass(BS[int(tm//2)%4],.45),.7)
# переходы на смене сцен
for c in (4,8,12,16,20):
    if c>4: put(c-.6,whoosh(),.55)
    put(c,boom(),.6)
put(22,boom(),.8)
x=np.stack([L,R],1)
fade=np.clip((DUR-np.arange(n)/SR)/1.8,0,1)[:,None]; x*=fade
x=np.tanh(x*1.4)/np.tanh(1.4); x/=np.abs(x).max()*1.08
w=wave.open('assets/track.wav','wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((x*32767).astype(np.int16).tobytes()); w.close()
