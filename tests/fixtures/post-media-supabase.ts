/** Test bundle only. Signed uploads and original reads terminate at intercepted fixture routes. */
export function createClient() {
  return {storage:{from(bucket:string) {
    if(bucket!=='media') throw new Error('Unexpected fixture bucket');
    return {
      getPublicUrl(path:string) {return {data:{publicUrl:`/fixture-original/${encodeURIComponent(path)}`}}},
      async uploadToSignedUrl(path:string,token:string,file:File,options:{contentType?:string}={}) {
        if(!token.startsWith('fixture-token-')) throw new Error('Unexpected fixture upload token');
        const response=await fetch(`/fixture-signed-upload/${encodeURIComponent(path)}`,{method:'PUT',headers:{'Content-Type':options.contentType||file.type,'X-Fixture-Upload-Token':token},body:file});
        return {error:response.ok?null:new Error('Fixture storage upload failed')};
      },
    };
  }}};
}
