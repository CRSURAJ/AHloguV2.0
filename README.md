# AHlogu V2.0

AHlogu is an offline-first work logging web app for Automatic Heating field teams.

The app uses AWS Cognito for sign-in and AWS API Gateway/Lambda/DynamoDB for cloud data. Local browser storage is still used as an offline cache for worker logs, drafts, active sessions, and job data.

## Current architecture

- Frontend: Next.js / React / TypeScript
- Authentication: AWS Cognito
- Backend: AWS API Gateway + Lambda
- Database: DynamoDB
- Cloud provider: AWS
- Offline cache: IndexedDB/local browser storage

## Main features

- Cognito email/password sign-in
- First-login new password flow
- Admin, Manager, and Worker permission levels
- User management
- Job management
- Worker time logging
- Save & Switch Job
- Break tracking
- Manual work-log sync to AWS
- Worker live status
- Admin work log view and export
- Offline-first local cache for worker activity

## Environment variables

Create a `.env.local` file based on `.env.example`.

Required frontend values:

```env
NEXT_PUBLIC_AHLOGU_CLOUD_PROVIDER=aws
NEXT_PUBLIC_AHLOGU_API_URL=https://YOUR_API_ID.execute-api.ap-southeast-4.amazonaws.com
NEXT_PUBLIC_AWS_REGION=ap-southeast-4
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-4_XXXXXXXXX
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=YOUR_COGNITO_APP_CLIENT_ID


```
