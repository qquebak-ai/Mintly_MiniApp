# Собственный трек: 120 BPM, дроп ровно на 10.0с — авторский, без чужих прав.
import numpy as np, wave
SR=44100; BPM=120; B=60/BPM; DUR=28.0; DROP=10.0
n=int(SR*DUR); out=np.zeros(n)
def put(t,s,g=1.0):
    i=int(t*SR); e=min(n,i+len(s)); out[i:e]+=g*s[:e-i]
def kick():
    t=np.arange(int(.32*SR))/SR; f=140*np.exp(-t*22)+42
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t*9)
def hat():
    t=np.arange(int(.06*SR))/SR; return np.random.RandomState(1).randn(len(t))*np.exp(-t*70)*.35
def bass(f,d):
    t=np.arange(int(d*SR))/SR; return (np.sin(2*np.pi*f*t)+.3*np.sin(4*np.pi*f*t))*np.exp(-t*3.2)*.5
def click():
    t=np.arange(int(.03*SR))/SR; return np.sin(2*np.pi*1900*t)*np.exp(-t*140)*.4
k=kick(); h=hat()
# I–II: тихий пульс и нарастающий шум к дропу
for i in range(int(3/B)): put(i*B,click(),.35)
for t in np.arange(3.0,10.0,B/2): put(t,h,.5)
t=np.arange(int(7*SR))/SR; noise=np.random.RandomState(2).randn(len(t))
rise=noise*(t/7)**3*.25; rise=np.convolve(rise,np.ones(6)/6,'same'); out[int(3*SR):int(10*SR)]+=rise
# тишина за долю секунды до дропа
out[int(9.75*SR):int(10*SR)]*=0.05
# III: кик на каждую долю, бас, хэт по восьмым, ускорение после 20с
for i,tm in enumerate(np.arange(DROP,24.0,B)):
    put(tm,k,1.0); put(tm,bass([55,55,65.4,49][int((tm-DROP)/(B*4))%4],B),.9)
for tm in np.arange(DROP,24.0,B/2): put(tm+B/4 if False else tm,h,.55)
for tm in np.arange(20.0,22.0,B/2): put(tm+B/4,k,.55)
# IV: один подтверждающий звук
put(24.6,click()*2,.9)
# затухание
out*= np.clip((DUR-np.arange(n)/SR)/1.5,0,1)
out/=np.abs(out).max()*1.15
w=wave.open('assets/track.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
w.writeframes((out*32767).astype(np.int16).tobytes()); w.close()
