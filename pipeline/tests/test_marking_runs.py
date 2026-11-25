"""The stored trail-marking runs follow the trail's real colours, whatever the line's simplification kept."""

from pipeline.geo import colour_runs


def test_a_marking_inside_one_simplified_piece_is_kept():
    # A straight line of 12 points: red, then blue, then red. Simplifying keeps only the two ends.
    colours = ["red"] * 4 + ["blue"] * 4 + ["red"] * 3
    pts, runs = colour_runs([0, 11], colours, 11)
    assert pts == [0, 4, 8, 11]
    assert runs == [
        {"from": 0, "to": 1, "colour": "red"},
        {"from": 1, "to": 2, "colour": "blue"},
        {"from": 2, "to": 3, "colour": "red"},
    ]


def test_a_short_unmarked_step_no_longer_colours_the_whole_piece():
    # The piece from point 2 starts with one unmarked step (a road crossing), then 8 red ones.
    colours = ["red", "red", None] + ["red"] * 8
    pts, runs = colour_runs([0, 2, 11], colours, 11)
    assert [(pts[r["from"]], pts[r["to"]], r["colour"]) for r in runs] == [(0, 2, "red"), (2, 3, None), (3, 11, "red")]


def test_a_there_and_back_path_stops_at_the_goal():
    # Kept points and marking changes past the goal (point 5) are left out; the goal itself stays.
    colours = ["green"] * 3 + ["yellow"] * 4 + ["green"] * 2
    pts, runs = colour_runs([0, 2, 9], colours, 5)
    assert pts == [0, 2, 3, 5]
    assert runs == [{"from": 0, "to": 2, "colour": "green"}, {"from": 2, "to": 3, "colour": "yellow"}]


def test_one_marking_all_the_way_adds_no_points():
    pts, runs = colour_runs([0, 3, 7], ["blue"] * 7, 7)
    assert pts == [0, 3, 7]
    assert runs == [{"from": 0, "to": 2, "colour": "blue"}]
