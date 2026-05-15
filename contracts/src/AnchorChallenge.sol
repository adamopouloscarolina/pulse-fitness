// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Anchor Challenge
/// @notice Holds CRC (or native xDAI on Chiado) stakes for a group fitness
///         challenge. The participant with the highest reported steps takes
///         the pot; the participant with the lowest pays an "anchor"
///         penalty on top of their stake.
///
/// Payout math, with N joined members, to-win stake X, anchor penalty P:
///   Winner  → receives N*X + 2P  (net: +(N-1)X + P)
///   Middle  → receives P         (net: -X)
///   Last    → receives 0         (net: -(X+P))
///
/// Sum of payouts: N*(X+P) = total deposits. Zero-sum, no funds lost.
///
/// v1 simplifying choices:
///   - All members must join before settle() works; otherwise anyone can
///     cancel after the duration to refund joiners.
///   - Steps are self-reported. v2 will add trust-circle quorum or oracle.
///   - Uses native chain currency (xDAI on Chiado for testing). The CRC
///     ERC-20 wrapper plugs in by changing the deposit / payout calls.
contract AnchorChallenge {
    enum Status { Open, Settled, Cancelled }

    struct Challenge {
        address       creator;
        uint128       stakeX;
        uint128       stakeP;
        uint64        createdAt;
        uint64        duration;
        Status        status;
        address[]     members;
    }

    mapping(uint256 => Challenge)                              private _challenges;
    mapping(uint256 => mapping(address => bool))               public  joined;
    mapping(uint256 => mapping(address => uint256))            public  reportedSteps;
    mapping(uint256 => mapping(address => uint256))            public  withdrawable;
    uint256 public nextId = 1;

    event ChallengeCreated(uint256 indexed id, address indexed creator, address[] members, uint128 stakeX, uint128 stakeP, uint64 duration);
    event Joined         (uint256 indexed id, address indexed who, uint256 amount);
    event StepsReported  (uint256 indexed id, address indexed who, uint256 steps);
    event Settled        (uint256 indexed id, address winner, address loser);
    event Cancelled      (uint256 indexed id);
    event Withdrew       (uint256 indexed id, address indexed who, uint256 amount);

    /// @notice Create a new challenge. Anyone can create. Members must call join() to deposit.
    function createChallenge(
        address[] calldata members,
        uint128 stakeX,
        uint128 stakeP,
        uint64 duration
    ) external returns (uint256 id) {
        require(members.length >= 2 && members.length <= 16, "members: 2..16");
        require(duration >= 1 hours && duration <= 30 days,  "duration: 1h..30d");
        id = nextId++;
        Challenge storage c = _challenges[id];
        c.creator   = msg.sender;
        c.stakeX    = stakeX;
        c.stakeP    = stakeP;
        c.createdAt = uint64(block.timestamp);
        c.duration  = duration;
        c.status    = Status.Open;
        for (uint256 i; i < members.length; ++i) {
            c.members.push(members[i]);
        }
        emit ChallengeCreated(id, msg.sender, members, stakeX, stakeP, duration);
    }

    /// @notice Deposit your stake (X + P). Must be on the member list and not yet joined.
    function join(uint256 id) external payable {
        Challenge storage c = _challenges[id];
        require(c.status == Status.Open,            "not open");
        require(block.timestamp < c.createdAt + c.duration, "ended");
        require(!joined[id][msg.sender],            "already joined");
        require(_isMember(c, msg.sender),           "not a member");
        require(msg.value == uint256(c.stakeX) + uint256(c.stakeP), "wrong amount");
        joined[id][msg.sender] = true;
        emit Joined(id, msg.sender, msg.value);
    }

    /// @notice Update your final-steps figure. Last submission wins.
    function submitSteps(uint256 id, uint256 steps) external {
        Challenge storage c = _challenges[id];
        require(c.status == Status.Open,            "not open");
        require(joined[id][msg.sender],             "not joined");
        require(block.timestamp < c.createdAt + c.duration, "ended");
        reportedSteps[id][msg.sender] = steps;
        emit StepsReported(id, msg.sender, steps);
    }

    /// @notice After the duration ends, anyone can settle (provided all members joined).
    function settle(uint256 id) external {
        Challenge storage c = _challenges[id];
        require(c.status == Status.Open,            "not open");
        require(block.timestamp >= c.createdAt + c.duration, "not ended");
        require(_allJoined(id, c),                  "not all joined; use cancel");

        c.status = Status.Settled;

        uint256 N = c.members.length;
        address winner = c.members[0];
        address loser  = c.members[0];
        uint256 winSteps  = reportedSteps[id][winner];
        uint256 loseSteps = reportedSteps[id][loser];

        for (uint256 i = 1; i < N; ++i) {
            address m  = c.members[i];
            uint256 sm = reportedSteps[id][m];
            if (sm >  winSteps)  { winner = m; winSteps  = sm; }
            if (sm <  loseSteps) { loser  = m; loseSteps = sm; }
        }

        // Wooden-spoon distribution
        withdrawable[id][winner] = N * uint256(c.stakeX) + 2 * uint256(c.stakeP);
        // loser already 0 by default
        for (uint256 i; i < N; ++i) {
            address m = c.members[i];
            if (m == winner || m == loser) continue;
            withdrawable[id][m] = uint256(c.stakeP);
        }

        emit Settled(id, winner, loser);
    }

    /// @notice Refund joiners when not everyone showed up. Anyone can call after duration ends.
    function cancel(uint256 id) external {
        Challenge storage c = _challenges[id];
        require(c.status == Status.Open,            "not open");
        require(block.timestamp >= c.createdAt + c.duration, "not ended");
        require(!_allJoined(id, c),                 "use settle");

        c.status = Status.Cancelled;
        uint256 refund = uint256(c.stakeX) + uint256(c.stakeP);
        for (uint256 i; i < c.members.length; ++i) {
            address m = c.members[i];
            if (joined[id][m]) {
                withdrawable[id][m] = refund;
            }
        }
        emit Cancelled(id);
    }

    /// @notice Pull your funds. Standard pull-payment pattern.
    function withdraw(uint256 id) external {
        uint256 amount = withdrawable[id][msg.sender];
        require(amount > 0, "nothing to withdraw");
        withdrawable[id][msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrew(id, msg.sender, amount);
    }

    // ---- Views ----------------------------------------------------

    function getChallenge(uint256 id) external view returns (
        address creator,
        uint128 stakeX,
        uint128 stakeP,
        uint64  createdAt,
        uint64  duration,
        Status  status,
        address[] memory members
    ) {
        Challenge storage c = _challenges[id];
        return (c.creator, c.stakeX, c.stakeP, c.createdAt, c.duration, c.status, c.members);
    }

    // ---- Internal -------------------------------------------------

    function _isMember(Challenge storage c, address who) internal view returns (bool) {
        for (uint256 i; i < c.members.length; ++i) if (c.members[i] == who) return true;
        return false;
    }

    function _allJoined(uint256 id, Challenge storage c) internal view returns (bool) {
        for (uint256 i; i < c.members.length; ++i) if (!joined[id][c.members[i]]) return false;
        return true;
    }
}
