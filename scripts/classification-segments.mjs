// Preserve completed variable-size ranges and dispatch only uncovered source text.
export function remainingSegments(length,saved,size=16000){
 if(!Number.isSafeInteger(length)||length<0||!Number.isSafeInteger(size)||size<1)throw Error('Invalid source length or segment size');
 const ordered=[...saved].sort((a,b)=>a.start-b.start),result=[];let cursor=0;
 const fill=end=>{while(cursor<end){const next=Math.min(end,cursor+size);result.push({start:cursor,end:next});cursor=next;}};
 for(const part of ordered){if(!Number.isSafeInteger(part.start)||!Number.isSafeInteger(part.end)||part.start<cursor||part.end<=part.start||part.end>length)throw Error('Invalid or overlapping saved segment range');fill(part.start);cursor=part.end;}
 fill(length);return result;
}
