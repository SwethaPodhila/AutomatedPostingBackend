import axios from "axios";
import qs from "querystring";

const FB_OAUTH_URL = 'https://www.facebook.com/v17.0/dialog/oauth';
const FB_TOKEN_URL = 'https://graph.facebook.com/v17.0/oauth/access_token';
const FB_GRAPH = 'https://graph.facebook.com/v17.0';

export function getAuthUrl({ clientId, redirectUri, state, scopes = [] }) {
    const params = {
        client_id: clientId,
        redirect_uri: redirectUri,
        state: state || 'state123',
        scope: scopes.join(','),
        response_type: 'code'
    };
    return `${FB_OAUTH_URL}?${qs.stringify(params)}`;
}

export async function exchangeCodeForToken({ clientId, clientSecret, redirectUri, code }) {
    const params = {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
    };
    const url = `${FB_TOKEN_URL}?${qs.stringify(params)}`;
    const res = await axios.get(url);
    return res.data;
}

export async function getUserPages(accessToken) {
    const url = `${FB_GRAPH}/me/accounts?access_token=${accessToken}`;
    const res = await axios.get(url);
    return res.data;
}

export async function publishToPage({ pageAccessToken, pageId, message }) {
    const url = `${FB_GRAPH}/${pageId}/feed`;
    const res = await axios.post(url, null, {
        params: { message, access_token: pageAccessToken }
    });
    return res.data;
}

export async function getPageDetails(pageId, accessToken) {
    const fields = 'id,name,fan_count,followers_count,link';
    const url = `${FB_GRAPH}/${pageId}?fields=${fields}&access_token=${accessToken}`;
    const res = await axios.get(url);
    return res.data;
}

export async function getPagePicture(pageId, accessToken) {
    const url = `${FB_GRAPH}/${pageId}?fields=picture{url}&access_token=${accessToken}`;
    const res = await axios.get(url);
    return res?.data?.picture?.data?.url || null;
}

export async function getPagePosts(pageId, accessToken) {
    const fields = 'id,message,created_time,likes.summary(true)';
    const url = `${FB_GRAPH}/${pageId}/posts?fields=${fields}&access_token=${accessToken}`;
    const res = await axios.get(url);
    return res.data.data || [];
}
