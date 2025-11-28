function patristicNectarWidget() {
  return {
    apiKeyInput: '',
    hasApiKey: false,
    loading: false,
    error: null,
    playlists: [],
    videos: [],
    searchQuery: '',
    selectedPlaylist: '',
    sortBy: WIDGET_CONFIG.DEFAULT_SORT,
    collapsedPlaylists: {},
    layoutMode: 'list',
    currentPage: 1,
    itemsPerPage: WIDGET_CONFIG.DEFAULT_ITEMS_PER_PAGE,

    get playlistsWithVideos() {
      const playlistGroups = [];

      for (const playlist of this.playlists) {
        let playlistVideos = this.videos.filter(v =>
          v.playlistIds.includes(playlist.id)
        );

        if (this.searchQuery) {
          const query = this.searchQuery.toLowerCase();
          playlistVideos = playlistVideos.filter(v =>
            v.title.toLowerCase().includes(query) ||
            v.description.toLowerCase().includes(query)
          );
        }

        if (this.selectedPlaylist && this.selectedPlaylist !== playlist.id) {
          continue;
        }

        playlistVideos = this.sortVideos(playlistVideos);

        if (playlistVideos.length > 0) {
          playlistGroups.push({
            playlist: playlist,
            videos: playlistVideos,
            isCollapsed: this.collapsedPlaylists[playlist.id] !== false
          });
        }
      }

      return playlistGroups;
    },

    get totalVideos() {
      return this.playlistsWithVideos.reduce((sum, group) => sum + group.videos.length, 0);
    },

    get allFilteredVideos() {
      let filtered = this.videos;

      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        filtered = filtered.filter(v =>
          v.title.toLowerCase().includes(query) ||
          v.description.toLowerCase().includes(query)
        );
      }

      if (this.selectedPlaylist) {
        filtered = filtered.filter(v =>
          v.playlistIds.includes(this.selectedPlaylist)
        );
      }

      return this.sortVideos(filtered);
    },

    get paginatedVideos() {
      const start = (this.currentPage - 1) * this.itemsPerPage;
      const end = start + this.itemsPerPage;
      return this.allFilteredVideos.slice(start, end);
    },

    get totalPages() {
      return Math.ceil(this.allFilteredVideos.length / this.itemsPerPage);
    },

    async init() {
      const storedKey = localStorage.getItem(WIDGET_CONFIG.STORAGE_KEY_API_KEY);
      if (storedKey) {
        this.apiKeyInput = storedKey;
        this.hasApiKey = true;
        await this.loadData();
      }

      this.$watch('searchQuery', () => { this.currentPage = 1; });
      this.$watch('selectedPlaylist', () => { this.currentPage = 1; });
      this.$watch('sortBy', () => { this.currentPage = 1; });
    },

    toggleLayout() {
      this.layoutMode = this.layoutMode === 'list' ? 'grid' : 'list';
      this.currentPage = 1;
    },

    async setApiKey() {
      if (!this.apiKeyInput.trim()) {
        this.error = 'Please enter an API key';
        return;
      }
      localStorage.setItem(WIDGET_CONFIG.STORAGE_KEY_API_KEY, this.apiKeyInput);
      this.hasApiKey = true;
      await this.loadData();
    },

    resetApiKey() {
      localStorage.removeItem(WIDGET_CONFIG.STORAGE_KEY_API_KEY);
      this.hasApiKey = false;
      this.apiKeyInput = '';
      this.error = null;
      this.videos = [];
      this.playlists = [];
      this.collapsedPlaylists = {};
    },

    async loadData() {
      this.loading = true;
      this.error = null;

      try {
        const api = new YouTubeAPI(this.apiKeyInput);
        this.playlists = await api.getPlaylists();
        this.videos = await api.getAllVideos();

        // Initialize all playlists as collapsed
        this.collapsedPlaylists = {};
        this.playlists.forEach(playlist => {
          this.collapsedPlaylists[playlist.id] = true;
        });
      } catch (err) {
        this.error = err.message || 'Failed to load videos. Please check your API key.';
        console.error('Widget error:', err);
      } finally {
        this.loading = false;
      }
    },

    togglePlaylist(playlistId) {
      this.collapsedPlaylists[playlistId] = !this.collapsedPlaylists[playlistId];
    },

    expandAll() {
      Object.keys(this.collapsedPlaylists).forEach(id => {
        this.collapsedPlaylists[id] = false;
      });
    },

    collapseAll() {
      Object.keys(this.collapsedPlaylists).forEach(id => {
        this.collapsedPlaylists[id] = true;
      });
    },

    sortVideos(videos) {
      const sorted = [...videos];
      switch (this.sortBy) {
        case 'date-desc':
          return sorted.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        case 'date-asc':
          return sorted.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
        case 'title-asc':
          return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case 'title-desc':
          return sorted.sort((a, b) => b.title.localeCompare(a.title));
        case 'views-desc':
          return sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        case 'duration-desc':
          return sorted.sort((a, b) => this.parseDuration(b.duration) - this.parseDuration(a.duration));
        case 'duration-asc':
          return sorted.sort((a, b) => this.parseDuration(a.duration) - this.parseDuration(b.duration));
        default:
          return sorted;
      }
    },

    parseDuration(duration) {
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || 0);
      const minutes = parseInt(match[2] || 0);
      const seconds = parseInt(match[3] || 0);
      return hours * 3600 + minutes * 60 + seconds;
    },

    formatDate(dateString) {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    },

    formatViews(views) {
      if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
      if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
      return views?.toString() || '0';
    }
  };
}

window.patristicNectarWidget = patristicNectarWidget;
