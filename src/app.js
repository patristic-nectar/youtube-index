function patristicNectarWidget() {
  return {
    loading: false,
    error: null,
    collections: [],
    items: [],
    collectionItemMap: null,
    lastUpdated: null,
    searchQuery: "",
    searchQueryInput: "",
    searchDebounceTimer: null,
    selectedCollection: "",
    sortBy: WIDGET_CONFIG.DEFAULT_SORT,
    collapsedMajorCollections: {},
    collapsedCollections: {},
    layoutMode: "list",
    currentPage: 1,
    itemsPerPage: WIDGET_CONFIG.DEFAULT_ITEMS_PER_PAGE,
    gridItemsPerPage: 20,
    collectionPages: {},
    visibleContentTypes: {
      video: true,
      lecture: true,
      podcast: true,
      synaxarion: true,
    },

    get sortedCollections() {
      return this.collections
        .filter((collection) => collection.type === "collection")
        .sort((a, b) => a.title.localeCompare(b.title));
    },

    get majorCollections() {
      const set = new Set();
      for (const collection of this.collections) {
        if (collection.type !== "collection") continue;
        set.add(collection.majorCollection || "Other");
      }
      return Array.from(set).sort((a, b) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });
    },

    get isAllContentTypesSelected() {
      return (
        this.visibleContentTypes.video &&
        this.visibleContentTypes.lecture &&
        this.visibleContentTypes.podcast &&
        this.visibleContentTypes.synaxarion
      );
    },

    get isDefaultContentTypesSelected() {
      return (
        this.visibleContentTypes.video &&
        this.visibleContentTypes.lecture &&
        this.visibleContentTypes.podcast &&
        this.visibleContentTypes.synaxarion
      );
    },

    get hasActiveFilters() {
      return (
        this.searchQuery.trim() !== "" ||
        this.selectedCollection !== "" ||
        !this.isDefaultContentTypesSelected
      );
    },

    get totalUnfilteredItems() {
      return this.items.length;
    },

    get allFilteredItems() {
      let filtered = this.items.filter((item) =>
        this.isContentTypeVisible(item.contentType, item),
      );

      if (this.searchQuery) {
        filtered = filtered.filter(
          (item) =>
            item.titleLowercase.includes(this.searchQuery) ||
            item.descriptionLowercase.includes(this.searchQuery) ||
            item.searchText.includes(this.searchQuery),
        );
      }

      if (this.selectedCollection) {
        filtered = filtered.filter((item) =>
          (item.parentCollectionIds || []).includes(this.selectedCollection),
        );
      }

      return this.sortItems(filtered);
    },

    get totalItems() {
      return this.allFilteredItems.length;
    },

    get contentTypeCounts() {
      const counts = { video: 0, lecture: 0, podcast: 0, synaxarion: 0 };
      for (const item of this.items) {
        if (item.isSynaxarion) counts.synaxarion += 1;
        if (item.contentType === "video") counts.video += 1;
        if (item.contentType === "lecture") counts.lecture += 1;
        if (item.contentType === "podcast") counts.podcast += 1;
      }
      return counts;
    },

    get collectionsWithItems() {
      if (!this.collectionItemMap) return [];

      const majorGroups = {};

      for (const collection of this.sortedCollections) {
        if (this.selectedCollection && this.selectedCollection !== collection.id) continue;

        const majorCollection = collection.majorCollection || "Other";

        const isCollapsed = this.collapsedCollections[collection.id] === true;
        let collectionItems = this.collectionItemMap.get(collection.id) || [];
        collectionItems = collectionItems.filter((item) =>
          this.isContentTypeVisible(item.contentType, item),
        );

        if (this.searchQuery) {
          collectionItems = collectionItems.filter(
            (item) =>
              item.titleLowercase.includes(this.searchQuery) ||
              item.descriptionLowercase.includes(this.searchQuery) ||
              item.searchText.includes(this.searchQuery),
          );
        }

        if (collectionItems.length === 0) continue;

        if (!majorGroups[majorCollection]) majorGroups[majorCollection] = [];

        majorGroups[majorCollection].push({
          collection,
          items: this.sortItems(collectionItems),
          itemCount: collectionItems.length,
          isCollapsed,
        });
      }

      const result = [];
      for (const major of this.majorCollections) {
        if (!majorGroups[major]) continue;
        const collections = majorGroups[major];
        const totalItemCount = collections.reduce((sum, group) => sum + group.itemCount, 0);
        result.push({
          majorCollection: major,
          collections,
          totalItemCount,
        });
      }
      return result;
    },

    async init() {
      await this.loadData();

      this.$watch("searchQueryInput", (newValue) => {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.searchQuery = newValue.toLowerCase();
          this.currentPage = 1;
          this.resetCollectionPages();
        }, 300);
      });

      this.$watch("selectedCollection", () => {
        this.currentPage = 1;
        this.resetCollectionPages();
      });
      this.$watch("sortBy", () => {
        this.currentPage = 1;
        this.resetCollectionPages();
      });
    },

    async loadData() {
      this.loading = true;
      this.error = null;

      try {
        const baseUrl = WIDGET_CONFIG.DATA_BASE_URL;
        const [collectionsRes, itemsRes, metadataRes] = await Promise.all([
          fetch(`${baseUrl}/index-collections.json`),
          fetch(`${baseUrl}/index-items.json`),
          fetch(`${baseUrl}/index-metadata.json`),
        ]);

        if (!collectionsRes.ok || !itemsRes.ok) {
          throw new Error("Failed to load index data");
        }

        this.collections = await collectionsRes.json();
        this.items = await itemsRes.json();

        this.collections = this.collections.map((collection) => ({
          ...collection,
          majorCollection: collection.majorCollection || "Other",
        }));

        this.items = this.items.map((item) => {
          const publishedTimestamp = item.publishedAt
            ? new Date(item.publishedAt).getTime()
            : 0;
          return {
            ...item,
            titleLowercase: (item.title || "").toLowerCase(),
            descriptionLowercase: (item.description || "").toLowerCase(),
            searchText: (item.searchText || "").toLowerCase(),
            parentCollectionIds: item.parentCollectionIds || [],
            isSynaxarion:
              String(item.majorCollection || "").toLowerCase() === "synaxarion" ||
              (item.majorCollections || []).some(
                (entry) => String(entry).toLowerCase() === "synaxarion",
              ),
            publishedTimestamp,
          };
        });

        this.collectionItemMap = new Map();
        for (const item of this.items) {
          for (const collectionId of item.parentCollectionIds) {
            if (!this.collectionItemMap.has(collectionId)) {
              this.collectionItemMap.set(collectionId, []);
            }
            this.collectionItemMap.get(collectionId).push(item);
          }
        }

        if (metadataRes.ok) {
          const metadata = await metadataRes.json();
          this.lastUpdated = metadata.timestamp;
        }

        this.collapsedCollections = {};
        this.collapsedMajorCollections = {};
        this.majorCollections.forEach((major) => {
          this.collapsedMajorCollections[major] = true;
        });
        this.collectionPages = {};
        this.sortedCollections.forEach((collection) => {
          this.collapsedCollections[collection.id] = true;
          this.collectionPages[collection.id] = 1;
        });
      } catch (err) {
        this.error = err.message || "Failed to load index data.";
        console.error("Widget error:", err);
      } finally {
        this.loading = false;
      }
    },

    resetCollectionPages() {
      Object.keys(this.collectionPages).forEach((id) => {
        this.collectionPages[id] = 1;
      });
    },

    isContentTypeVisible(contentType, item = null) {
      if (item?.isSynaxarion) return this.visibleContentTypes.synaxarion;
      if (!contentType) return true;
      if (contentType === "video") return this.visibleContentTypes.video;
      if (contentType === "lecture") return this.visibleContentTypes.lecture;
      if (contentType === "podcast") return this.visibleContentTypes.podcast;
      return true;
    },

    toggleContentType(contentType) {
      const selectedCount = Object.values(this.visibleContentTypes).filter(Boolean).length;
      if (this.visibleContentTypes[contentType] && selectedCount === 1) {
        return;
      }
      this.visibleContentTypes[contentType] = !this.visibleContentTypes[contentType];
      this.currentPage = 1;
      this.resetCollectionPages();
    },

    selectAllContentTypes() {
      this.visibleContentTypes.video = true;
      this.visibleContentTypes.lecture = true;
      this.visibleContentTypes.podcast = true;
      this.visibleContentTypes.synaxarion = true;
      this.currentPage = 1;
      this.resetCollectionPages();
    },

    toggleLayout() {
      this.layoutMode = this.layoutMode === "list" ? "grid" : "list";
      this.currentPage = 1;
      this.resetCollectionPages();
    },

    isMajorCollapsed(majorCollection) {
      return this.collapsedMajorCollections[majorCollection] === true;
    },

    toggleMajorCollection(majorCollection) {
      this.collapsedMajorCollections[majorCollection] =
        !this.collapsedMajorCollections[majorCollection];
    },

    toggleCollection(collectionId) {
      this.collapsedCollections[collectionId] = !this.collapsedCollections[collectionId];
      this.collectionPages[collectionId] = 1;
    },

    expandAll() {
      Object.keys(this.collapsedMajorCollections).forEach((major) => {
        this.collapsedMajorCollections[major] = false;
      });
      Object.keys(this.collapsedCollections).forEach((id) => {
        this.collapsedCollections[id] = false;
      });
    },

    collapseAll() {
      Object.keys(this.collapsedMajorCollections).forEach((major) => {
        this.collapsedMajorCollections[major] = true;
      });
      Object.keys(this.collapsedCollections).forEach((id) => {
        this.collapsedCollections[id] = true;
      });
    },

    sortItems(items) {
      const sorted = [...items];
      switch (this.sortBy) {
        case "date-desc":
          return sorted.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);
        case "date-asc":
          return sorted.sort((a, b) => a.publishedTimestamp - b.publishedTimestamp);
        case "title-asc":
          return sorted.sort((a, b) => a.title.localeCompare(b.title));
        case "title-desc":
          return sorted.sort((a, b) => b.title.localeCompare(a.title));
        case "views-desc":
          return sorted.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
        case "likes-desc":
          return sorted.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
        case "duration-desc":
          return sorted.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
        case "duration-asc":
          return sorted.sort((a, b) => (a.durationSeconds || 0) - (b.durationSeconds || 0));
        default:
          return sorted;
      }
    },

    formatDate(dateString) {
      if (!dateString) return "Unknown date";
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    },

    formatViews(views) {
      if (views >= 1000000) return (views / 1000000).toFixed(1) + "M";
      if (views >= 1000) return (views / 1000).toFixed(1) + "K";
      return views?.toString() || "0";
    },

    getCollectionPage(collectionId) {
      return this.collectionPages[collectionId] || 1;
    },

    setCollectionPage(collectionId, page) {
      this.collectionPages[collectionId] = page;
    },

    getCollectionTotalPages(itemCount) {
      return Math.ceil(itemCount / this.gridItemsPerPage);
    },

    getPaginatedItems(items, collectionId) {
      const page = this.getCollectionPage(collectionId);
      const start = (page - 1) * this.gridItemsPerPage;
      const end = start + this.gridItemsPerPage;
      return items.slice(start, end);
    },

    nextCollectionPage(collectionId, totalPages) {
      const currentPage = this.getCollectionPage(collectionId);
      if (currentPage < totalPages) {
        this.setCollectionPage(collectionId, currentPage + 1);
      }
    },

    prevCollectionPage(collectionId) {
      const currentPage = this.getCollectionPage(collectionId);
      if (currentPage > 1) {
        this.setCollectionPage(collectionId, currentPage - 1);
      }
    },
  };
}

window.patristicNectarWidget = patristicNectarWidget;
