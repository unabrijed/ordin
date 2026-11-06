import { deflateSync } from 'node:zlib';

// A deliberately dependency-free raster renderer for the runnable demo.
const letters: Record<string, string> = {
 A:'01110100011000111111100011000110001',B:'11110100011000111110100011000111110',C:'01111100001000010000100001000001111',D:'11110100011000110001100011000111110',E:'11111100001000011110100001000011111',F:'11111100001000011110100001000010000',G:'01111100001000010111100011000101111',H:'10001100011000111111100011000110001',I:'11111001000010000100001000010011111',J:'00111000100001000010100101001001100',K:'10001100101010011000101001001010001',L:'10000100001000010000100001000011111',M:'10001110111010110101100011000110001',N:'10001110011010110011100011000110001',O:'01110100011000110001100011000101110',P:'11110100011000111110100001000010000',Q:'01110100011000110001101011001001101',R:'11110100011000111110101001001010001',S:'01111100001000001110000010000111110',T:'11111001000010000100001000010000100',U:'10001100011000110001100011000101110',V:'10001100011000110001100010101000100',W:'10001100011000110101101011101110001',X:'10001100010101000100010101000110001',Y:'10001100010101000100001000010000100',Z:'11111000010001000100010001000011111',
 '0':'01110100011001110101110011000101110','1':'00100011000010000100001000010001110','2':'01110100010000100010001000100011111','3':'11110000010000101110000010000111110','4':'00010001100101010010111110001000010','5':'11111100001000011110000010000111110','6':'01110100001000011110100011000101110','7':'11111000010001000100010000100001000','8':'01110100011000101110100011000101110','9':'01110100011000101111000010000101110','-':'00000000000000011111000000000000000','.':'00000000000000000000000000011000110','/':'00001000100001000100010000100010000',':':'00000001100011000000001100011000000'
};
function crc(data: Buffer) { let c = 0xffffffff; for (const b of data) { c ^= b; for(let i=0;i<8;i++) c = (c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; }
function chunk(name: string, data: Buffer) { const tag=Buffer.from(name); const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const sum=Buffer.alloc(4);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([len,tag,data,sum]); }
export function renderCard(title: string, subtitle: string, template: string, premium: boolean) {
 const w=premium?1200:600,h=premium?630:315, unit=w/600;
 const palettes: Record<string, number[][]>={ cobalt:[[19,36,183],[238,242,255],[134,169,255]], paper:[[243,240,229],[31,35,37],[215,92,59]], midnight:[[20,25,32],[230,235,229],[186,239,117]] };
 const [bg,ink,accent]=palettes[template]??palettes.cobalt;
 const pixels=Buffer.alloc(w*h*3);
 const rect=(x:number,y:number,rw:number,rh:number,color:number[])=>{for(let yy=Math.max(0,Math.floor(y));yy<Math.min(h,y+rh);yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(w,x+rw);xx++){const i=(yy*w+xx)*3;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];}};
 const text=(value:string,x:number,y:number,size:number,color:number[])=>{for(const ch of value.toUpperCase()){const glyph=letters[ch];if(glyph)for(let j=0;j<35;j++)if(glyph[j]==='1')rect(x+(j%5)*size,y+Math.floor(j/5)*size,size,size,color);x+=size*6;}};
 rect(0,0,w,h,bg);rect(24*unit,24*unit,28*unit,28*unit,accent);text('F',31*unit,29*unit,2.5*unit,bg);
 text('FRAME / BUILD SOMETHING',64*unit,34*unit,1.5*unit,ink);
 const words=title.toUpperCase().split(/\s+/);let line='',lines:string[]=[];for(const word of words){if((line+' '+word).trim().length>22&&line){lines.push(line);line='';}line=(line+' '+word).trim();}if(line)lines.push(line);
 lines.slice(0,3).forEach((l,i)=>text(l.slice(0,22),26*unit,(95+i*43)*unit,4*unit,ink));
 text(subtitle.slice(0,40),28*unit,244*unit,2*unit,accent);
 rect(26*unit,281*unit,548*unit,unit,accent);text(premium?'MADE WITH FRAME':'FRAME FREE PREVIEW',28*unit,294*unit,unit,ink);
 const scan=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)pixels.copy(scan,y*(w*3+1)+1,y*w*3,(y+1)*w*3);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
