import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file,'utf8'));
function write(file,value,exclusive=false){
 const text=JSON.stringify(value,null,2);fs.mkdirSync(path.dirname(file),{recursive:true});
 if(exclusive)fs.writeFileSync(file,text,{flag:'wx'});
 else{const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);}
 if(fs.readFileSync(file,'utf8')!==text)throw Error('Classification recovery readback mismatch');
}
function invalidQuotes(payload,result){
 const issues=[];
 for(const item of result?.items||[]){const source=payload.items.find(n=>n.id===item.id);if(!source||typeof source.text!=='string'||!Array.isArray(item.tags))continue;
  item.tags.forEach((tag,index)=>{if(typeof tag.quote!=='string'||!tag.quote.trim()||!source.text.includes(tag.quote))issues.push({id:item.id,tagIndex:index,tagName:tag.name,quote:tag.quote??null,reason:'Tag quote is not a nonempty literal substring of this exact input text',sourceHash:source.sourceHash,start:source.start,end:source.end});});
 }
 return issues;
}
function sameOtherFields(original,corrected,issues){
 const mask=result=>{const copy=structuredClone(result);for(const issue of issues){const item=copy.items?.find(n=>n.id===issue.id);if(!item?.tags?.[issue.tagIndex])return null;item.tags[issue.tagIndex].quote='REPAIRABLE_LITERAL_QUOTE';}return copy;};
 return digest(mask(original))===digest(mask(corrected));
}
// Runs only inside the original classifier. Preserve the original return before
// validation, and spend at most one quote-only correction for its fingerprint.
export async function selectClassificationResult({work,payload,model,run,validate,gate,onSelected}){
 const requestHash=digest({version:1,model,payload});
 const file=path.join(work,'classification-returns',requestHash+'.json');
 let original=fs.existsSync(file)?read(file):null;
 if(!original){await gate();const result=await run(payload);original={version:1,model,requestHash,payload,result,resultHash:digest(result),returnedAt:new Date().toISOString()};write(file,original,true);}
 if(original.version!==1||original.model!==model||original.requestHash!==requestHash||digest(original.payload)!==digest(payload)||digest(original.result)!==original.resultHash)throw Error('Classification original return identity changed');
 await gate();
 try{const selected=validate(original.result);onSelected?.({requestHash,originalResultHash:original.resultHash,selectedFile:file,fileHash:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});return selected;}catch(error){
  const issues=invalidQuotes(payload,original.result);if(!issues.length)throw error;
  const correctionFile=path.join(work,'classification-returns',requestHash+'.correction-'+original.resultHash+'.json');
  let attempt=fs.existsSync(correctionFile)?read(correctionFile):null;
  if(attempt&&(attempt.requestHash!==requestHash||attempt.originalResultHash!==original.resultHash||attempt.model!==model))throw Error('Classification correction identity changed');
  if(!attempt){
   await gate();
   const correctionPayload={...payload,literalEvidenceCorrection:{attempt:1,requestHash,originalResultHash:original.resultHash,previousResult:original.result,issues},validationFeedback:'Correct only the invalid tag quote fields identified in literalEvidenceCorrection. Select an exact nonempty contiguous quote from the same supplied source text. Keep every original item, tag, tag order, id, name, reason, summary and uncertainties exactly unchanged. Do not drop or rename tags, borrow another source, normalize punctuation, or weaken literal matching. Return the same complete JSON schema. If no legitimate quote exists, leave it invalid and explain nothing outside the schema; validation will stop rather than silently delete a candidate.'};
   attempt={version:1,model,requestHash,originalResultHash:original.resultHash,issues,payload:correctionPayload,status:'attempting',startedAt:new Date().toISOString()};write(correctionFile,attempt,true);
   try{attempt.result=await run(correctionPayload);attempt.resultHash=digest(attempt.result);attempt.status='returned';write(correctionFile,attempt);}catch(failure){attempt.status='failed';attempt.error=String(failure.message||failure);write(correctionFile,attempt);throw failure;}
  }
  await gate();
  if(!['returned','validated'].includes(attempt.status)||!attempt.result||digest(attempt.result)!==attempt.resultHash)throw Error('CLASSIFICATION_CORRECTION_BUDGET_EXHAUSTED: original return and correction retained');
  try{
   if(!sameOtherFields(original.result,attempt.result,issues))throw Error('Quote correction changed other fields or silently removed a tag');
   const selected=validate(attempt.result);if(attempt.status!=='validated'){attempt.status='validated';attempt.validatedAt=new Date().toISOString();write(correctionFile,attempt);}onSelected?.({requestHash,originalResultHash:original.resultHash,selectedFile:correctionFile,fileHash:createHash('sha256').update(fs.readFileSync(correctionFile)).digest('hex')});return selected;
  }catch(failure){attempt.status='rejected';attempt.error=String(failure.message||failure);write(correctionFile,attempt);throw Error('CLASSIFICATION_CORRECTION_REJECTED: '+attempt.error);}
 }
}
