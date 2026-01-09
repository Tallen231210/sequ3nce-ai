import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// Type for role play room participant
type RolePlayParticipant = {
  closerId: string;
  userName: string;
  joinedAt: number;
};

// Get or create a role play room for a team
// This action creates a Daily.co room if one doesn't exist yet
export const getOrCreateRolePlayRoom = action({
  args: { teamId: v.string() },
  handler: async (ctx, args): Promise<{ roomUrl: string; roomName: string }> => {
    // First check if team already has a room
    const result = await ctx.runQuery(api.rolePlayRoom.getTeamRolePlayRoom, {
      teamId: args.teamId,
    });

    if (result?.dailyRoomUrl && result?.dailyRoomName) {
      return {
        roomUrl: result.dailyRoomUrl,
        roomName: result.dailyRoomName,
      };
    }

    // Create a new Daily.co room
    const dailyApiKey = process.env.DAILY_API_KEY;
    if (!dailyApiKey) {
      throw new Error("DAILY_API_KEY not configured");
    }

    const roomName = `team-${args.teamId.replace(/[^a-zA-Z0-9]/g, "")}`;

    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          max_participants: 15,
          enable_prejoin_ui: false,
          enable_screenshare: true,
          enable_chat: true,
          enable_knocking: false,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (!response.ok) {
      // If room already exists (409), try to get it
      if (response.status === 409) {
        const getResponse = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
          headers: {
            Authorization: `Bearer ${dailyApiKey}`,
          },
        });

        if (getResponse.ok) {
          const existingRoom = await getResponse.json();
          const roomUrl = existingRoom.url;

          // Save to database
          await ctx.runMutation(api.rolePlayRoom.saveRolePlayRoom, {
            teamId: args.teamId,
            dailyRoomUrl: roomUrl,
            dailyRoomName: roomName,
          });

          return { roomUrl, roomName };
        }
      }

      const errorText = await response.text();
      throw new Error(`Failed to create Daily.co room: ${response.status} ${errorText}`);
    }

    const roomData = await response.json();
    const roomUrl = roomData.url;

    // Save to database
    await ctx.runMutation(api.rolePlayRoom.saveRolePlayRoom, {
      teamId: args.teamId,
      dailyRoomUrl: roomUrl,
      dailyRoomName: roomName,
    });

    return { roomUrl, roomName };
  },
});

// Internal query to get team's role play room data
export const getTeamRolePlayRoom = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    // Convert string ID to actual team ID and get team
    const teamId = args.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!team) {
      return null;
    }
    // Return just the room data, not the whole team
    return team.rolePlayRoom ? {
      dailyRoomUrl: team.rolePlayRoom.dailyRoomUrl,
      dailyRoomName: team.rolePlayRoom.dailyRoomName,
      participants: team.rolePlayRoom.participants,
    } : null;
  },
});

// Save role play room info to team
export const saveRolePlayRoom = mutation({
  args: {
    teamId: v.string(),
    dailyRoomUrl: v.string(),
    dailyRoomName: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = args.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);

    if (!team) {
      throw new Error("Team not found");
    }

    // Get existing participants or empty array
    const existingParticipants: RolePlayParticipant[] = team.rolePlayRoom?.participants || [];

    await ctx.db.patch(teamId, {
      rolePlayRoom: {
        dailyRoomUrl: args.dailyRoomUrl,
        dailyRoomName: args.dailyRoomName,
        participants: existingParticipants,
      },
    });
  },
});

// Join the role play room
export const joinRolePlayRoom = mutation({
  args: {
    teamId: v.string(),
    closerId: v.string(),
    userName: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = args.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);

    if (!team) {
      throw new Error("Team not found");
    }

    if (!team.rolePlayRoom) {
      throw new Error("Role play room not set up");
    }

    // Check if already in the room
    const existingParticipants: RolePlayParticipant[] = team.rolePlayRoom.participants || [];
    const alreadyJoined = existingParticipants.some(
      (p: RolePlayParticipant) => p.closerId === args.closerId
    );

    if (alreadyJoined) {
      // Already in the room, just return success
      return { success: true };
    }

    // Add to participants
    const updatedParticipants: RolePlayParticipant[] = [
      ...existingParticipants,
      {
        closerId: args.closerId,
        userName: args.userName,
        joinedAt: Date.now(),
      },
    ];

    await ctx.db.patch(teamId, {
      rolePlayRoom: {
        dailyRoomUrl: team.rolePlayRoom.dailyRoomUrl,
        dailyRoomName: team.rolePlayRoom.dailyRoomName,
        participants: updatedParticipants,
      },
    });

    return { success: true };
  },
});

// Leave the role play room
export const leaveRolePlayRoom = mutation({
  args: {
    teamId: v.string(),
    closerId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = args.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);

    if (!team || !team.rolePlayRoom) {
      return { success: true }; // Already not in room
    }

    // Remove from participants
    const existingParticipants: RolePlayParticipant[] = team.rolePlayRoom.participants || [];
    const updatedParticipants = existingParticipants.filter(
      (p: RolePlayParticipant) => p.closerId !== args.closerId
    );

    await ctx.db.patch(teamId, {
      rolePlayRoom: {
        dailyRoomUrl: team.rolePlayRoom.dailyRoomUrl,
        dailyRoomName: team.rolePlayRoom.dailyRoomName,
        participants: updatedParticipants,
      },
    });

    return { success: true };
  },
});

// Get current participants in the role play room
export const getRolePlayRoomParticipants = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const teamId = args.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);

    if (!team || !team.rolePlayRoom) {
      return [];
    }

    return team.rolePlayRoom.participants || [];
  },
});
