export interface ImageRefererRuleRequest {
  type: 'ENABLE_IMAGE_REFERER';
  payload: {
    imageUrl: string;
    articleUrl: string;
  };
}

export async function enableImageReferer(imageUrl: string, articleUrl: string): Promise<void> {
  if (!chrome.runtime?.sendMessage) {
    throw new Error('当前环境无法设置图片来源');
  }
  const response = await chrome.runtime.sendMessage({
    type: 'ENABLE_IMAGE_REFERER',
    payload: { imageUrl, articleUrl },
  } satisfies ImageRefererRuleRequest);
  if (!response?.success) {
    throw new Error(response?.error || '设置图片来源失败');
  }
}
