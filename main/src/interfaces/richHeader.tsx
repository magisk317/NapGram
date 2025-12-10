import { FastifyInstance } from 'fastify';
import { Pair } from '../domain/models/Pair';
import { Group, GroupMemberInfo } from '../infrastructure/clients/qq';
import Html from '@kitajs/html';
import { getLogger } from '../shared/logger';
import posthog from '../domain/models/posthog';
import env from '../domain/models/env';
import Instance from '../domain/models/Instance';

const logger = getLogger('Rich Header');

import { formatDate } from '../shared/utils/date';

async function handler(request: any, reply: any) {
  const params = request.params;

  try {
    const fallback = () => {
      // @ts-ignore
      return <html lang="zh">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta property="og:image"
            content={`${env.WEB_ENDPOINT}/qqAvatar/${params.userId}`} />
          <meta property="og:title" content={params.userId} />
          <title>用户：{params.userId}</title>
        </head>
        <body>
          <div>用户 {params.userId}</div>
        </body>
      </html>;
    };

    let pairRecord: any;
    let instance: any;

    // Find pair by apiKey across all instances
    // @ts-ignore
    for (const inst of Instance.instances) {
      if (inst.forwardPairs) {
        const pairs = inst.forwardPairs.getAll();
        const found = pairs.find(p => p.apiKey === params.apiKey);
        if (found) {
          pairRecord = found;
          instance = inst;
          break;
        }
      }
    }

    if (!pairRecord || !instance || !instance.qqClient) {
      logger.warn(`[richHeader] Pair not found for apiKey=${params.apiKey}`);
      reply.header('content-type', 'text/html; charset=utf-8');
      return fallback();
    }

    const groupId = pairRecord.qqRoomId.toString();
    const userId = params.userId;

    let memberInfo;
    let strangerInfo;
    try {
      // Fetch group member info
      memberInfo = await instance.qqClient.getGroupMemberInfo(groupId, userId);
      if (!memberInfo) {
        logger.warn(`[richHeader] Member info is null for userId=${userId} in groupId=${groupId}`);
        reply.header('content-type', 'text/html; charset=utf-8');
        return fallback();
      }

      // Fetch stranger info for extra details (birthday, email, etc.)
      strangerInfo = await instance.qqClient.getUserInfo(userId);
    } catch (e) {
      logger.warn(`[richHeader] Failed to get info: ${e}`);
      reply.header('content-type', 'text/html; charset=utf-8');
      return fallback();
    }

    let profile: any = {
      ...memberInfo,
      // Merge stranger info if available
      ...(strangerInfo || {}),
      // Map fields to match what the template expects
      // @ts-ignore
      birthday: strangerInfo ? [strangerInfo.birthday_year, strangerInfo.birthday_month, strangerInfo.birthday_day] : [],
      // @ts-ignore
      email: strangerInfo?.email,
      // @ts-ignore
      QID: strangerInfo?.qid,
      // @ts-ignore
      regTimestamp: strangerInfo?.reg_time || 0,
      // @ts-ignore
      country: strangerInfo?.country || '',
      // @ts-ignore
      province: strangerInfo?.province || '',
      // @ts-ignore
      city: strangerInfo?.city || '',
    };

    const location = [profile.country, profile.province, profile.city].join(' ').trim();
    const birthday = (profile.birthday || []).some((it: any) => it) ? profile.birthday.join('/') : '';

    reply.header('content-type', 'text/html; charset=utf-8');
    // @ts-ignore
    return <html lang="zh">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="og:image"
          content={`${env.WEB_ENDPOINT}/qqAvatar/${params.userId}`} />
        {
          memberInfo.title ?
            <meta property="og:site_name" content={`${memberInfo.role === 'member' ? '' : memberInfo.role}「${memberInfo.title}」`} /> :
            <meta property="og:site_name" content={memberInfo.role} />
        }
        <meta property="og:title" content={memberInfo.card || memberInfo.nickname} />
        <title>群成员：{memberInfo.card || memberInfo.nickname}</title>
        {/* language=CSS */}
        <style>{`
          html, body {
            padding: 0;
            margin: 0;
            color: #303133;
          }

          * {
            box-sizing: border-box;
          }

          #app {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 20px;
          }

          #avatar, #card {
            width: 100%;
            max-width: 500px;
          }

          #card {
            padding: 0 20px;
            line-height: 1.8em;
          }

          .badge {
            border-radius: 0.5em;
            color: #fff;
            padding: 0 0.2em;
          }

          .badge-owner {
            background-color: #FDCE3A !important;
          }

          .badge-admin {
            background-color: #2FE1D8 !important;
          }

          .badge-member {
            background-color: #ADB5CA;
          }

          .badge-hasTitle {
            background-color: #D88BFF;
          }

          .secondary {
            color: #606266;
            font-size: small;
          }

          .detailItem {
            font-size: smaller;
            margin-top: 0.5em;
          }

          @media screen and (min-width: 900px) {
            #app {
              flex-direction: row;
              height: 100vh;
            }

            #avatar {
              width: 400px;
            }

            #card {
              width: fit-content;
            }
          }
        `}</style>
      </head>
      <body>
        <div id="app">
          <img id="avatar" src={`${env.WEB_ENDPOINT}/qqAvatar/${params.userId}`} alt="头像" />
          <div id="card">
            <div>
              <span class={`badge badge-${memberInfo.role} ${memberInfo.title && 'badge-hasTitle'}`}>{memberInfo.title || memberInfo.role}</span>
              {memberInfo.card || memberInfo.nickname}
            </div>
            {memberInfo.card && <div class="secondary">
              {memberInfo.nickname}
            </div>}
            <div class="secondary">
              {params.userId}
              {profile.QID && <span style="padding-left: 1em">QID: {profile.QID}</span>}
              {profile.email && <span style="padding-left: 1em">{profile.email}</span>}
            </div>
            {location && <div class="secondary">{location}</div>}
            {birthday &&
              <div class="detailItem">
                <div class="secondary">生日</div>
                {birthday}
              </div>
            }
            <div class="detailItem">
              <div class="secondary">加入时间</div>
              {formatDate(memberInfo.join_time * 1000)}
            </div>
            <div class="detailItem">
              <div class="secondary">上次发言时间</div>
              {formatDate(memberInfo.last_sent_time * 1000)}
            </div>
            <div class="detailItem">
              <div class="secondary">注册时间</div>
              {formatDate(profile.regTimestamp * 1000)}
            </div>
          </div>
        </div>
      </body>
    </html>;
  }
  catch (e) {
    logger.error('Error:', e);
    posthog.capture('RichHeaderError', { error: e });
    reply.status(500).send('Internal Server Error');
  }
};

export default async function (fastify: FastifyInstance) {
  fastify.get('/richHeader/:apiKey/:userId', handler);
}
