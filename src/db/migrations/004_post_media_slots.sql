-- Media could not be attached to a post. post_media existed and was joined
-- against, but nothing ever inserted a row, and the exporter wrote no image
-- fields -- so heroImage, coverImage and gallery, which every collection in the
-- target site defines, were unreachable from the CMS.

-- Single-value slots live on the post rather than as roles in the join table:
-- there is exactly one of each, and a column enforces that without a partial
-- unique index. ON DELETE SET NULL so deleting an image clears the slot instead
-- of failing the delete or leaving a dangling id.
ALTER TABLE posts ADD COLUMN hero_media_id TEXT REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN cover_media_id TEXT REFERENCES media(id) ON DELETE SET NULL;

-- Galleries are ordered, and the same image can carry different alt text in
-- different posts -- a photo captioned for one story reads wrong in another.
-- Both belong to the association, not to the image.
ALTER TABLE post_media ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE post_media ADD COLUMN alt_text TEXT;

CREATE INDEX idx_post_media_order ON post_media(post_id, sort_order);

-- Once images are set through the CMS, the CMS owns the image fields for that
-- post and writes them authoritatively -- including removing one that has been
-- cleared. Until then they are left alone, so a hand-written heroImage on an
-- imported entry survives.
--
-- Without this there is no way to tell "the CMS has no hero" from "the CMS has
-- never been asked", and clearing a hero, or deleting the image behind it, left
-- a dangling path in frontmatter that only hand-editing the file could remove.
ALTER TABLE posts ADD COLUMN images_managed INTEGER NOT NULL DEFAULT 0;
