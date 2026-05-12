/**
 * Base selection for public user data.
 * Does not include virtual fields like 'isFollowing'.
 */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicUrl: true,
  followersCount: true,
  followingCount: true,
  isPro: true,
  proSubscriptionType: true,
  _count: {
    select: {
      workoutLogs: { where: { deletedAt: null } },
    },
  },
}

/**
 * Returns a select object for public user data, optionally including follow status.
 * @param currentUserId The ID of the user performing the request
 */
export const getPublicUserSelect = (currentUserId?: string) => ({
  ...publicUserSelect,
  followers: currentUserId
    ? { where: { followerId: currentUserId }, select: { followerId: true } }
    : false,
})