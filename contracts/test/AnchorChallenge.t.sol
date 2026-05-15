// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {AnchorChallenge} from "../src/AnchorChallenge.sol";

contract AnchorChallengeTest is Test {
    AnchorChallenge ch;
    address you    = address(0xAA);
    address alex   = address(0xBB);
    address maria  = address(0xCC);
    address joao   = address(0xDD);

    uint128 constant X = 20 ether;
    uint128 constant P = 10 ether;
    uint64  constant DURATION = 1 days;

    function setUp() public {
        ch = new AnchorChallenge();
        vm.deal(you,   100 ether);
        vm.deal(alex,  100 ether);
        vm.deal(maria, 100 ether);
        vm.deal(joao,  100 ether);
    }

    function _create() internal returns (uint256 id) {
        address[] memory members = new address[](4);
        members[0] = you;
        members[1] = alex;
        members[2] = maria;
        members[3] = joao;
        id = ch.createChallenge(members, X, P, DURATION);
    }

    function _allJoin(uint256 id) internal {
        vm.prank(you);   ch.join{value: X + P}(id);
        vm.prank(alex);  ch.join{value: X + P}(id);
        vm.prank(maria); ch.join{value: X + P}(id);
        vm.prank(joao);  ch.join{value: X + P}(id);
    }

    function testAnchorMath() public {
        uint256 id = _create();
        _allJoin(id);

        // You win, Joao comes last
        vm.prank(you);   ch.submitSteps(id, 50_000);
        vm.prank(alex);  ch.submitSteps(id, 30_000);
        vm.prank(maria); ch.submitSteps(id, 25_000);
        vm.prank(joao);  ch.submitSteps(id, 10_000);

        vm.warp(block.timestamp + DURATION + 1);
        ch.settle(id);

        // Winner: N*X + 2P = 4*20 + 2*10 = 100 ether
        assertEq(ch.withdrawable(id, you),  4 * uint256(X) + 2 * uint256(P));
        // Middle: P = 10 ether each
        assertEq(ch.withdrawable(id, alex),  uint256(P));
        assertEq(ch.withdrawable(id, maria), uint256(P));
        // Last: 0
        assertEq(ch.withdrawable(id, joao),  0);

        // Pull payouts
        uint256 yBefore = you.balance;
        vm.prank(you); ch.withdraw(id);
        assertEq(you.balance, yBefore + 4 * uint256(X) + 2 * uint256(P));

        // Net P&L checks
        // You deposited X+P=30, withdrew 100. Net +70.
        // Joao deposited 30, withdrew 0. Net -30.
        // Alex/Maria deposited 30, withdrew 10. Net -20 each.
        // Sum of net P&L: +70 - 30 - 20 - 20 = 0
    }

    function testCannotJoinTwice() public {
        uint256 id = _create();
        vm.prank(you); ch.join{value: X + P}(id);
        vm.prank(you);
        vm.expectRevert(bytes("already joined"));
        ch.join{value: X + P}(id);
    }

    function testNonMemberCantJoin() public {
        uint256 id = _create();
        address randomDude = address(0xDEAD);
        vm.deal(randomDude, 100 ether);
        vm.prank(randomDude);
        vm.expectRevert(bytes("not a member"));
        ch.join{value: X + P}(id);
    }

    function testCancelRefundsWhenNotAllJoin() public {
        uint256 id = _create();
        vm.prank(you);  ch.join{value: X + P}(id);
        vm.prank(alex); ch.join{value: X + P}(id);
        // Maria & Joao never join

        vm.warp(block.timestamp + DURATION + 1);
        ch.cancel(id);

        // You and Alex get their stake back
        assertEq(ch.withdrawable(id, you),  uint256(X) + uint256(P));
        assertEq(ch.withdrawable(id, alex), uint256(X) + uint256(P));
        // Maria & Joao never deposited, owed nothing
        assertEq(ch.withdrawable(id, maria), 0);
        assertEq(ch.withdrawable(id, joao),  0);
    }

    function testSettleFailsBeforeEnd() public {
        uint256 id = _create();
        _allJoin(id);
        vm.expectRevert(bytes("not ended"));
        ch.settle(id);
    }

    function testSumIsZero() public {
        uint256 id = _create();
        _allJoin(id);
        vm.prank(you);   ch.submitSteps(id, 12000);
        vm.prank(alex);  ch.submitSteps(id, 11000);
        vm.prank(maria); ch.submitSteps(id, 10000);
        vm.prank(joao);  ch.submitSteps(id, 5000);
        vm.warp(block.timestamp + DURATION + 1);
        ch.settle(id);

        uint256 total = ch.withdrawable(id, you) + ch.withdrawable(id, alex)
                      + ch.withdrawable(id, maria) + ch.withdrawable(id, joao);
        // Total payouts should equal total deposits: 4 * (X + P)
        assertEq(total, 4 * (uint256(X) + uint256(P)));
    }
}
