export type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  JPUSH_APP_KEY: string
  JPUSH_MASTER_SECRET: string
}

// ==========================================
// Home Feed Block System Types (首页切片流架构)
// ==========================================

export type HomeBlockType =
  | 'hero_banner'
  | 'category_tabs'
  | 'section_title'
  | 'artist_grid'
  | 'essay_card'
  | 'track_list'
  | 'album_row'
  | 'custom_banner'

export interface BaseHomeBlock {
  id: string
  type: HomeBlockType | string
  title?: string
  subtitle?: string
  sortOrder?: number
  visible?: boolean
  style?: Record<string, any>
  [key: string]: any
}

export interface HeroBannerItem {
  id: string
  title: string
  subtitle?: string
  badge?: string
  coverUrl: string
  actionType: 'album' | 'artist' | 'song' | 'playlist' | 'url' | 'none' | string
  actionTarget?: string
  bgColor?: string
}

export interface HeroBannerBlock extends BaseHomeBlock {
  type: 'hero_banner'
  items: HeroBannerItem[]
  autoPlay?: boolean
  intervalMs?: number
}

export interface CategoryTabItem {
  id: string
  label: string
  icon?: string
  categoryKey: string
  filter?: Record<string, any>
}

export interface CategoryTabsBlock extends BaseHomeBlock {
  type: 'category_tabs'
  items: CategoryTabItem[]
}

export interface SectionTitleBlock extends BaseHomeBlock {
  type: 'section_title'
  title: string
  subtitle?: string
  actionText?: string
  actionType?: string
  actionTarget?: string
}

export interface ArtistGridItem {
  id: string
  name: string
  avatarUrl?: string
  countText?: string
  tag?: string
  category?: string
}

export interface ArtistGridBlock extends BaseHomeBlock {
  type: 'artist_grid'
  title?: string
  subtitle?: string
  layout?: 'grid' | 'horizontal_scroll' | 'list'
  items: ArtistGridItem[]
}

export interface EssayCardBlock extends BaseHomeBlock {
  type: 'essay_card'
  title: string
  subtitle?: string
  author?: string
  publishDate?: string
  excerpt?: string
  content?: string
  coverUrl?: string
  albumId?: string | number
  artistName?: string
  tag?: string
  actionUrl?: string
}

export interface TrackListItem {
  id: string | number
  title: string
  artistName: string
  albumTitle?: string
  coverUrl?: string
  filePath?: string
  lrcPath?: string
  duration?: number
  trackIndex?: number
  badge?: string
  audioUrl?: string
}

export interface TrackListBlock extends BaseHomeBlock {
  type: 'track_list'
  title?: string
  subtitle?: string
  items: TrackListItem[]
}

export interface AlbumRowItem {
  id: string | number
  title: string
  artistName: string
  coverUrl?: string
  releaseDate?: string
  songCount?: number
  tag?: string
}

export interface AlbumRowBlock extends BaseHomeBlock {
  type: 'album_row'
  title?: string
  subtitle?: string
  items: AlbumRowItem[]
}

export type HomeBlock =
  | HeroBannerBlock
  | CategoryTabsBlock
  | SectionTitleBlock
  | ArtistGridBlock
  | EssayCardBlock
  | TrackListBlock
  | AlbumRowBlock
  | BaseHomeBlock

export interface HomeFeedData {
  version: string
  updatedAt: string
  items: HomeBlock[]
}

export interface HomeFeedResponse {
  code: number
  message: string
  data: HomeFeedData
}

export interface SaveHomeFeedRequest {
  version?: string
  items: HomeBlock[]
}
