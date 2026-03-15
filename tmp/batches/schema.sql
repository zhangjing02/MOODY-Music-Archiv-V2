CREATE TABLE artists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			region TEXT,
			bio TEXT,
			photo_url TEXT
		);
CREATE TABLE albums (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artist_id INTEGER,
			title TEXT NOT NULL,
			release_date TEXT,
			genre TEXT,
			cover_url TEXT, storage_id TEXT DEFAULT 'primary',
			FOREIGN KEY(artist_id) REFERENCES artists(id)
		);
CREATE TABLE songs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artist_id INTEGER,
			album_id INTEGER,
			title TEXT NOT NULL,
			duration INTEGER,
			file_path TEXT UNIQUE, 
			lrc_path TEXT,
			format TEXT,
			bit_rate INTEGER,
			bpm FLOAT,
			mood TEXT,
			play_count INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP, track_index INTEGER DEFAULT 0, storage_id TEXT DEFAULT 'primary',
			FOREIGN KEY(artist_id) REFERENCES artists(id),
			FOREIGN KEY(album_id) REFERENCES albums(id)
		);
CREATE TABLE client_errors (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			error_type TEXT NOT NULL,
			song_id INTEGER,
			message TEXT,
			occurrence_count INTEGER DEFAULT 1,
			last_reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(error_type, song_id, message)
		);
CREATE TABLE entity_tags (
			tag_id INTEGER,
			entity_type TEXT CHECK(entity_type IN ('artist', 'album', 'song')),
			entity_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(tag_id, entity_type, entity_id),
			FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
		);
CREATE TABLE favorites (
			user_id INTEGER,
			song_id INTEGER,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY(user_id, song_id),
			FOREIGN KEY(user_id) REFERENCES users(id),
			FOREIGN KEY(song_id) REFERENCES songs(id)
		);
CREATE TABLE library_albums (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artist_id TEXT,
			title TEXT NOT NULL,
			year TEXT,
			cover TEXT,
			FOREIGN KEY(artist_id) REFERENCES library_artists(id)
		);
CREATE TABLE library_artists (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			alias TEXT, -- JSON array
			"group" TEXT,
			category TEXT,
			avatar TEXT
		);
CREATE TABLE library_songs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			album_id INTEGER,
			title TEXT NOT NULL,
			path TEXT, -- 预留
			lrc_path TEXT, -- 预留
			FOREIGN KEY(album_id) REFERENCES library_albums(id)
		);
CREATE TABLE playback_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			song_id INTEGER,
			played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id),
			FOREIGN KEY(song_id) REFERENCES songs(id)
		);
CREATE TABLE playlist_songs (
			playlist_id INTEGER,
			song_id INTEGER,
			sort_order INTEGER DEFAULT 0,
			PRIMARY KEY(playlist_id, song_id),
			FOREIGN KEY(playlist_id) REFERENCES playlists(id),
			FOREIGN KEY(song_id) REFERENCES songs(id)
		);
CREATE TABLE playlists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER,
			name TEXT NOT NULL,
			cover_url TEXT,
			is_public BOOLEAN DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);
CREATE TABLE tags (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			category TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
CREATE TABLE user_settings (
			user_id INTEGER PRIMARY KEY,
			last_volume FLOAT DEFAULT 0.5,
			theme_mode TEXT DEFAULT 'dark',
			auto_play BOOLEAN DEFAULT 1,
			FOREIGN KEY(user_id) REFERENCES users(id)
		);
CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			level INTEGER DEFAULT 1,
			role TEXT DEFAULT 'user',
			avatar_url TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_entity_tags_lookup ON entity_tags(entity_type, entity_id);
CREATE INDEX idx_lib_albums_artist ON library_albums(artist_id);
CREATE INDEX idx_lib_songs_album ON library_songs(album_id);
CREATE INDEX idx_songs_title ON songs(title);
