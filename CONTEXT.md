# Bookmark Manager

A private read-later app: a signed-in User saves links and organises them into Collections. Nothing is ever visible to anyone but the User who created it.

## Language

**User**:
A human who signs in to the app. Every Collection and Bookmark belongs to exactly one User, and only that User can see it.
_Avoid_: person, member, account, collaborator

**Collection**:
A named group of Bookmarks, belonging to one User.
_Avoid_: folder, list, tag

**Bookmark**:
A saved link (URL and title, optionally with notes), belonging to one User and to at most one Collection.
_Avoid_: link, item, save

**Owner**:
The User a Collection or Bookmark belongs to: the User who created it. Only the Owner can see, change, or learn of the existence of a resource.
_Avoid_: author, creator

**Uncategorised Bookmark**:
A Bookmark that belongs to no Collection.

## Relationships

- A **User** has many **Collections** and many **Bookmarks**
- A **Bookmark** belongs to zero or one **Collection**; the Collection and the Bookmark always have the same **Owner**
- Collections are never shared: there is no second User with access to anything
