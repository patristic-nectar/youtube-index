const WIDGET_CONFIG = {
  YOUTUBE_CHANNEL_ID: "UCz72pwrQRTXibU14NmHep8w",
  YOUTUBE_API_BASE: "https://www.googleapis.com/youtube/v3",
  DATA_BASE_URL: ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) || window.location.protocol === 'file:'
    ? './data'
    : 'https://raw.githubusercontent.com/patristic-nectar/youtube-index/main/data',
  DEFAULT_ITEMS_PER_PAGE: 20,
  DEFAULT_SORT: "date-desc",
};
