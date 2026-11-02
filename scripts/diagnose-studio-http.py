r"""Safe single-request probe of Meta's Responses API, independent of Muse Studio.

Usage from Windows PowerShell in the project directory:
    python .\scripts\diagnose-studio-http.py --model muse-spark-1.3
This sends a minimal billable request and never prints the API key or prompt.
"""
import argparse
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv


def main() -> int:
    parser=argparse.ArgumentParser(description='Meta Muse Studio HTTP diagnostics')
    parser.add_argument('--model',default='muse-spark-1.3',choices=['muse-spark-1.1','muse-spark-1.2','muse-spark-1.3','muse-wonder-1.0'])
    args=parser.parse_args()
    root=Path(__file__).resolve().parent.parent
    load_dotenv(root/'.env',override=True)
    key=os.getenv('MODEL_API_KEY','').strip()
    if not key:
        print('MODEL_API_KEY missing in project .env')
        return 2
    try:
        with httpx.Client(timeout=60,follow_redirects=False) as client:
            response=client.post('https://api.meta.ai/v1/responses',
                headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},
                json={'model':args.model,'input':'Reply briefly with OK.',
                      'reasoning':{'effort':'minimal'},'max_output_tokens':512})
        print('Model:',args.model)
        print('Meta HTTP status:',response.status_code)
        if response.is_error:
            body=response.json() if 'json' in response.headers.get('Content-Type','') else {}
            error=body.get('error',{}) if isinstance(body,dict) else {}
            if not isinstance(error,dict):error={}
            print('Error type:',error.get('type'))
            print('Error parameter:',error.get('param'))
            print('Error code:',error.get('code'))
            # Provider error message may contain request details; do not print it.
            print('If HTTP 400, use model settings minimal + 512 tokens in Studio. If still failing, inspect the error locally before sharing.')
            return 1
        doc=response.json()
        print('Response status:',doc.get('status'))
        print('Input tokens:',(doc.get('usage') or {}).get('input_tokens'))
        print('Output tokens:',(doc.get('usage') or {}).get('output_tokens'))
        return 0
    except (httpx.HTTPError,ValueError) as exc:
        print('Network or response format error:',type(exc).__name__)
        return 2

if __name__=='__main__':
    raise SystemExit(main())
